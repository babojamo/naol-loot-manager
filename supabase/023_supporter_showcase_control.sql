-- Run after 022 in NAOL only. One master switch controls every supporter display.
begin;
alter table public.loot_manager_supporters add column if not exists showcase_enabled boolean not null default true;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v22(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v22;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;enabled boolean;page_no integer;pages integer;total integer;search text;
begin
  if p_operation='platform_supporter_save' and p_data ? 'showcaseEnabled' and jsonb_typeof(p_data->'showcaseEnabled') is distinct from 'boolean' then
    return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a valid supporter showcase setting.'));
  end if;
  if p_operation in ('supporters_list','supporters_featured') then
    search:=left(trim(coalesce(p_data->>'query','')),100);
    page_no:=greatest(1,least(coalesce((p_data->>'page')::integer,1),1000000));
    select count(*) into total from public.loot_manager_supporters s
      join public.loot_manager_accounts a on a.id=s.user_id join public.loot_manager_guilds g on g.id=s.guild_id
      where s.showcase_enabled and s.published and public.loot_manager_showcase_eligible(a.id,g.id)
      and (p_operation<>'supporters_featured' or s.featured)
      and (search='' or strpos(lower(a.username||' '||g.name),lower(search))>0);
    pages:=greatest(1,(total+23)/24);page_no:=case when p_operation='supporters_featured' then 1 else least(page_no,pages) end;
    select coalesce(jsonb_agg(t.item order by t.display_order,t.created_at,t.username),'[]') into result from (
      select jsonb_build_object('username',a.username,'badge',s.badge,'playground',jsonb_build_object('name',g.name,'slug',g.slug,'icon',g.icon,'shopEnabled',g.shop_enabled,'inquiriesEnabled',g.inquiries_enabled)) as item,
        case when p_operation='supporters_featured' then s.featured_order else 0 end as display_order,s.created_at,a.username
      from public.loot_manager_supporters s join public.loot_manager_accounts a on a.id=s.user_id join public.loot_manager_guilds g on g.id=s.guild_id
      where s.showcase_enabled and s.published and public.loot_manager_showcase_eligible(a.id,g.id)
      and (p_operation<>'supporters_featured' or s.featured)
      and (search='' or strpos(lower(a.username||' '||g.name),lower(search))>0)
      order by display_order,s.created_at,a.username limit 24 offset (page_no-1)*24
    )t;
    if p_operation='supporters_featured' then return result;end if;
    return jsonb_build_object('supporters',result,'total',total,'page',page_no,'pages',pages);
  end if;
  -- Delegate authorization and all existing settings checks before reading or changing the master switch.
  result:=public.loot_manager_operation_v22(p_operation,p_actor,p_guild_id,p_data);
  if result ? '_error' then return result;end if;
  if p_operation='platform_supporter_get' then
    select showcase_enabled into enabled from public.loot_manager_supporters where user_id=p_data->>'userId';
    result:=result||jsonb_build_object('showcaseEnabled',coalesce(enabled,true));
  elsif p_operation='platform_supporter_save' and p_data ? 'showcaseEnabled' then
    update public.loot_manager_supporters set showcase_enabled=(p_data->>'showcaseEnabled')::boolean where user_id=p_data->>'userId';
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
