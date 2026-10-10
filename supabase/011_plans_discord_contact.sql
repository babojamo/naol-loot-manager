-- Run after 010 in the separate NAOL project.
begin;
alter table public.loot_manager_accounts add column if not exists discord_override boolean not null default false;
create or replace function public.loot_manager_limits(account_id text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
select (case public.loot_manager_effective_plan(id) when 'Free' then '{"playgrounds":1,"runs":5,"managers":0}'::jsonb when 'Elite' then '{"playgrounds":5,"runs":null,"managers":5}'::jsonb else '{"playgrounds":15,"runs":null,"managers":10}'::jsonb end)||case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then '{}'::jsonb else limit_overrides end from public.loot_manager_accounts where id=account_id;
$$;
create or replace function public.loot_manager_discord_allowed(account_id text) returns boolean language sql security invoker set search_path=public,pg_temp as $$
select coalesce((select not banned and (discord_override or public.loot_manager_effective_plan(id)='Legend') from public.loot_manager_accounts where id=account_id),false);
$$;
revoke all on function public.loot_manager_discord_allowed(text) from public,anon,authenticated;
grant execute on function public.loot_manager_discord_allowed(text) to service_role;
create or replace function public.loot_manager_discord_enqueue_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not public.loot_manager_discord_allowed((select user_id from public.loot_manager_guild_users where guild_id=new.guild_id and role='owner')) then return null;end if;
  return new;
end;$$;
revoke all on function public.loot_manager_discord_enqueue_guard() from public,anon,authenticated;
drop trigger if exists loot_manager_discord_entitlement on public.loot_manager_discord_outbox;
create trigger loot_manager_discord_entitlement before insert on public.loot_manager_discord_outbox for each row execute function public.loot_manager_discord_enqueue_guard();
create table if not exists public.loot_manager_contact_limits(bucket text primary key,attempts integer not null,expires_at timestamptz not null);
alter table public.loot_manager_contact_limits enable row level security;
revoke all on public.loot_manager_contact_limits from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_contact_limits to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v10(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v10;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;ctx jsonb;allowed boolean;items jsonb;bucket_name text;n integer;
begin
  if p_operation='contact_gate' then
    bucket_name:=p_data->>'bucket';
    if bucket_name is null or bucket_name !~ '^[a-f0-9]{64}$' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Invalid contact request.'));end if;
    perform pg_advisory_xact_lock(110011);
    delete from public.loot_manager_contact_limits where expires_at<=now();
    insert into public.loot_manager_contact_limits values(bucket_name,1,now()+interval '1 hour') on conflict(bucket) do update set attempts=loot_manager_contact_limits.attempts+1 returning attempts into n;
    if n>5 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Too many messages. Please try again in an hour.'));end if;
    insert into public.loot_manager_contact_limits values('site',1,now()+interval '1 day') on conflict(bucket) do update set attempts=loot_manager_contact_limits.attempts+1 returning attempts into n;
    if n>500 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Contact messages are temporarily limited. Please try again tomorrow.'));end if;
    return '{}'::jsonb;
  end if;
  if p_operation in ('discord_config','discord_claim','discord_test','discord_status') then
    ctx:=public.loot_manager_operation_v10('guild_context',p_actor,p_guild_id,'{}');if ctx ? '_error' then return ctx;end if;
    select public.loot_manager_discord_allowed(user_id) into allowed from public.loot_manager_guild_users where guild_id=p_guild_id and role='owner';
    if not coalesce(allowed,false) then
      if p_operation='discord_claim' then return 'null'::jsonb;
      elsif p_operation='discord_test' or (p_operation='discord_config' and coalesce((p_data->>'enabled')::boolean,false) and not coalesce((p_data->>'clear')::boolean,false)) then
        return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Discord activity logs require Legend or access granted by the platform administrator.'));
      elsif p_operation='discord_status' then
        result:=public.loot_manager_operation_v10(p_operation,p_actor,p_guild_id,p_data);
        return result||jsonb_build_object('allowed',false,'error','Discord activity logs require Legend or access granted by the platform administrator.');
      end if;
    end if;
  end if;
  result:=public.loot_manager_operation_v10(p_operation,p_actor,p_guild_id,p_data);if result ? '_error' then return result;end if;
  if p_operation='platform_update' and p_data ? 'discordOverride' then
    update public.loot_manager_accounts set discord_override=(p_data->>'discordOverride')::boolean where id=p_data->>'userId';
  elsif p_operation='settings_get' then
    select public.loot_manager_discord_allowed(user_id) into allowed from public.loot_manager_guild_users where guild_id=p_guild_id and role='owner';
    result:=result||jsonb_build_object('discordAllowed',coalesce(allowed,false));
  elsif p_operation='account' then
    result:=result||jsonb_build_object('discord_override',(select discord_override from public.loot_manager_accounts where id=result->>'id'));
  elsif p_operation='platform_users_page' then
    select coalesce(jsonb_agg(value||jsonb_build_object('discord_override',a.discord_override) order by ord),'[]'::jsonb) into items from jsonb_array_elements(result->'users') with ordinality as t(value,ord) join public.loot_manager_accounts a on a.id=value->>'id';
    result:=jsonb_set(result,'{users}',items);
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
