-- Run after 021 in NAOL only. Sidebar badges are explicitly enabled by administrators.
begin;
alter table public.loot_manager_supporters add column if not exists sidebar_badge_enabled boolean not null default false;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v21(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v21;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;enabled boolean;
begin
  if p_operation='platform_supporter_save' and p_data ? 'sidebarBadgeEnabled' and jsonb_typeof(p_data->'sidebarBadgeEnabled') is distinct from 'boolean' then
    return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a valid sidebar badge setting.'));
  end if;
  -- Preserve administrator authorization, membership checks, public publishing and featured settings.
  result:=public.loot_manager_operation_v21(p_operation,p_actor,p_guild_id,p_data);
  if result ? '_error' then return result;end if;
  if p_operation='platform_supporter_get' then
    select sidebar_badge_enabled into enabled from public.loot_manager_supporters where user_id=p_data->>'userId';
    result:=result||jsonb_build_object('sidebarBadgeEnabled',coalesce(enabled,false));
  elsif p_operation='platform_supporter_save' and p_data ? 'sidebarBadgeEnabled' then
    update public.loot_manager_supporters set sidebar_badge_enabled=(p_data->>'sidebarBadgeEnabled')::boolean where user_id=p_data->>'userId';
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
