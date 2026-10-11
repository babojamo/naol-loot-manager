-- Run after 012 in the NAOL Supabase project. Shares only loot names and images.
begin;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v12(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v12;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_operation <> 'loot_catalog' then return public.loot_manager_operation_v12(p_operation,p_actor,p_guild_id,p_data);end if;
  result:=public.loot_manager_operation_v12('guild_context',p_actor,p_guild_id,'{}');
  if result is null or result ? '_error' then return coalesce(result,jsonb_build_object('_error',jsonb_build_object('status',403,'message','Choose an accessible playground.')));end if;
  if p_data ? 'names' and (jsonb_typeof(p_data->'names') <> 'array' or jsonb_array_length(p_data->'names')>100) then
    return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose at most 100 loot names.'));
  end if;
  -- No source playground, player, stock, price or sales attributes leave this projection.
  with eligible as (
    select l.guild_id,l.payload from public.loot_manager_ledgers l
    join public.loot_manager_guild_users u on u.guild_id=l.guild_id and u.role='owner'
    join public.loot_manager_accounts a on a.id=u.user_id and not a.banned
  ), names as (
    select trim(loot->>'name') name from eligible e
    cross join lateral jsonb_array_elements(coalesce(e.payload->'runs','[]')) r
    cross join lateral jsonb_array_elements(coalesce(r->'loots','[]')) loot
    union all select trim(i.key) from eligible e cross join lateral jsonb_each_text(coalesce(e.payload->'lootImages','{}')) i
  ), unique_names as (
    select distinct on(lower(name)) name from names where name<>'' order by lower(name),name
  ), images as (
    select distinct on(lower(trim(i.key))) lower(trim(i.key)) key,i.value image
    from eligible e cross join lateral jsonb_each_text(coalesce(e.payload->'lootImages','{}')) i
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
