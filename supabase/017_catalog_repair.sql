-- Run after 016. Restores the catalog even if migration 013 was skipped.
-- Do not rerun 013 over newer migrations: this wrapper preserves their behavior.
begin;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v15(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v15;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_operation<>'loot_catalog' then return public.loot_manager_operation_v15(p_operation,p_actor,p_guild_id,p_data);end if;
  result:=public.loot_manager_operation_v15('guild_context',p_actor,p_guild_id,'{}');
  if result is null or result ? '_error' then return coalesce(result,jsonb_build_object('_error',jsonb_build_object('status',403,'message','Choose an accessible playground.')));end if;
  if p_data ? 'names' then
    if jsonb_typeof(p_data->'names') is distinct from 'array' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose at most 100 valid loot names.'));
    end if;
    if jsonb_array_length(p_data->'names')>100 or exists(select 1 from jsonb_array_elements(p_data->'names') n where jsonb_typeof(n)<>'string' or length(n #>> '{}')>200) then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose at most 100 valid loot names.'));
    end if;
  end if;
  -- Only item names and inline images are shared. Never expose the source
  -- playground, its members, prices, stock quantities, sales or audit records.
  with eligible as (
    select l.guild_id,l.payload from public.loot_manager_ledgers l
    join public.loot_manager_guild_users u on u.guild_id=l.guild_id and u.role='owner'
    join public.loot_manager_accounts a on a.id=u.user_id and not a.banned
  ), names as (
    select trim(loot->>'name') name from eligible e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.payload->'runs')='array' then e.payload->'runs' else '[]' end) r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r->'loots')='array' then r->'loots' else '[]' end) loot
    where jsonb_typeof(loot->'name')='string'
    union all select trim(i.key) from eligible e cross join lateral jsonb_each_text(case when jsonb_typeof(e.payload->'lootImages')='object' then e.payload->'lootImages' else '{}' end) i
  ), unique_names as (
    select distinct on(lower(name)) name from names where name<>'' and length(name)<=200 order by lower(name),name
  ), images as (
    select distinct on(lower(trim(i.key))) lower(trim(i.key)) key,i.value image
    from eligible e cross join lateral jsonb_each_text(case when jsonb_typeof(e.payload->'lootImages')='object' then e.payload->'lootImages' else '{}' end) i
    where i.value like 'data:image/%' and length(i.value)<=700000
      and lower(trim(i.key)) in (select lower(trim(value)) from jsonb_array_elements_text(coalesce(p_data->'names','[]')))
    order by lower(trim(i.key)),(e.guild_id=p_guild_id) desc,e.guild_id
  )
  select case when p_data ? 'names' then (select coalesce(jsonb_object_agg(key,image),'{}') from images)
    else (select coalesce(jsonb_agg(name order by lower(name)),'[]') from unique_names) end into result;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
