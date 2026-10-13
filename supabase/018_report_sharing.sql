-- Run after 017 in the NAOL Supabase project.
begin;
create table if not exists public.loot_manager_report_shares (
  id uuid primary key, guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  report_type text not null check(report_type in ('inventory','sales','runs','drops')),
  filters jsonb not null default '{}' check(jsonb_typeof(filters)='object'),
  token text not null unique check(token ~ '^[a-f0-9]{64}$'),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists loot_manager_report_shares_by_guild on public.loot_manager_report_shares(guild_id,created_at desc);
alter table public.loot_manager_report_shares enable row level security;
revoke all on public.loot_manager_report_shares from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_report_shares to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v17(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v17;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; s public.loot_manager_report_shares%rowtype; payload jsonb; g jsonb;
begin
  if p_operation in ('report_share_list','report_share_create','report_share_revoke') then
    result:=public.loot_manager_operation_v17('guild_context',p_actor,p_guild_id,'{}');
    if result ? '_error' then return result;end if;
    if result->>'role' not in ('owner','manager') then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Playground manager access required.'));end if;
    if p_operation='report_share_list' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.enabled desc,t.created_at desc),'[]') into result from
        (select id,report_type,filters,token,enabled,created_at from public.loot_manager_report_shares where guild_id=p_guild_id order by enabled desc,created_at desc limit 200)t;
      return result;
    elsif p_operation='report_share_revoke' then
      update public.loot_manager_report_shares set enabled=false where guild_id=p_guild_id and id=(p_data->>'id')::uuid;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This report link was not found.'));end if;
      return jsonb_build_object('revoked',true);
    end if;
    if p_data->>'type' is null or p_data->>'type' not in ('inventory','sales','runs','drops') or jsonb_typeof(p_data->'filters') is distinct from 'object' or length((p_data->'filters')::text)>2048
      or coalesce(p_data->>'token','') !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'tokenHash','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a valid report and filters.'));
    end if;
    -- Keep link creation bounded without changing account plan entitlements.
    perform 1 from public.loot_manager_guilds where id=p_guild_id for update;
    if (select count(*) from public.loot_manager_report_shares where guild_id=p_guild_id and enabled)>=100 then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Revoke an older public report link before creating another.'));
    end if;
    insert into public.loot_manager_report_shares(id,guild_id,report_type,filters,token,token_hash)
      values((p_data->>'id')::uuid,p_guild_id,p_data->>'type',p_data->'filters',p_data->>'token',p_data->>'tokenHash') returning * into s;
    return to_jsonb(s)-'token_hash'-'guild_id';
  elsif p_operation='report_share_view' then
    select * into s from public.loot_manager_report_shares where token_hash=p_data->>'tokenHash' and enabled;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This shared report is unavailable.'));end if;
    select jsonb_build_object('name',gg.name,'icon',gg.icon) into g from public.loot_manager_guilds gg
      join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner'
      join public.loot_manager_accounts a on a.id=m.user_id where gg.id=s.guild_id and not a.banned;
    if g is null then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This shared report is unavailable.'));end if;
    select l.payload into payload from public.loot_manager_ledgers l where l.guild_id=s.guild_id;
    if payload is null then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This shared report is unavailable.'));end if;
    -- Backend-only input. The page projects only this report and saved filters;
    -- the ledger, account emails, settings and audit log never reach visitors.
    return jsonb_build_object('guild',g,'type',s.report_type,'filters',s.filters,'state',payload);
  end if;
  return public.loot_manager_operation_v17(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
