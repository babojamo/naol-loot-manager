-- Run after 023 in NAOL only. Opaque, session-bound impersonation with an audit trail.
begin;
create table if not exists public.loot_manager_impersonations(
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  target_id text not null,
  admin_username text not null,
  target_username text not null,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  session_hash text not null check(session_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '1 hour',
  ended_at timestamptz,
  end_reason text
);
create index if not exists loot_manager_impersonations_admin_idx on public.loot_manager_impersonations(admin_id,session_hash);
create table if not exists public.loot_manager_impersonation_events(
  id bigint generated always as identity primary key,
  impersonation_id uuid not null references public.loot_manager_impersonations(id),
  operation text not null,
  guild_id uuid,
  created_at timestamptz not null default now()
);
alter table public.loot_manager_impersonations enable row level security;
alter table public.loot_manager_impersonation_events enable row level security;
revoke all on public.loot_manager_impersonations,public.loot_manager_impersonation_events from public,anon,authenticated;
grant select,insert,update on public.loot_manager_impersonations to service_role;
grant select,insert on public.loot_manager_impersonation_events to service_role;
grant usage,select on sequence public.loot_manager_impersonation_events_id_seq to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v23(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v23;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor jsonb;result jsonb;administrator public.loot_manager_accounts%rowtype;target public.loot_manager_accounts%rowtype;
  impersonation public.loot_manager_impersonations%rowtype;
begin
  if p_actor ? 'impersonationId' then
    if coalesce(p_actor->>'impersonationId','') !~ '^[a-f0-9-]{36}$' then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Exit impersonation and sign in again.'));
    end if;
    select s.* into impersonation from public.loot_manager_impersonations s
      join public.loot_manager_accounts a on a.id=s.admin_id
      join public.loot_manager_accounts t on t.id=s.target_id
      where s.id=(p_actor->>'impersonationId')::uuid and a.auth_user_id::text=p_actor->>'impersonatorId'
        and t.auth_user_id::text=p_actor->>'id' and s.session_hash=p_actor->>'impersonationSessionHash'
        and a.platform_admin and not a.banned and a.deletion_requested_at is null
        and not t.platform_admin and not t.banned and t.deletion_requested_at is null
        and s.ended_at is null and s.expires_at>now();
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Impersonation ended or access changed. Exit impersonation to continue.'));end if;
    if p_operation like 'platform_%' or p_operation in ('account_delete','account_change_gate','account_profile_check') then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This action is unavailable while impersonating.'));
    end if;
    result:=public.loot_manager_operation_v23(p_operation,p_actor,p_guild_id,p_data);
    if not (result ? '_error') and p_operation in ('ledger_save','guild_create','settings_update','guild_icon_update','invite_create','invite_accept','invite_revoke','team_remove','team_role','code_join','code_rotate','join_approve','join_reject','playground_delete','discord_config','discord_test','run_share_save','report_share_create','report_share_revoke') then
      insert into public.loot_manager_impersonation_events(impersonation_id,operation,guild_id) values(impersonation.id,p_operation,p_guild_id);
    end if;
    return result;
  end if;
  if p_operation in ('platform_impersonation_start','platform_impersonation_resolve','platform_impersonation_end') then
    if coalesce(p_data->>'tokenHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'sessionHash','') !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Invalid impersonation session.'));
    end if;
    -- Ending a session is permitted even after the administrator loses elevated access.
    if p_operation='platform_impersonation_end' then
      update public.loot_manager_impersonations s set ended_at=now(),end_reason='exited'
        from public.loot_manager_accounts a where a.id=s.admin_id and a.auth_user_id::text=p_actor->>'id'
        and s.token_hash=p_data->>'tokenHash' and s.session_hash=p_data->>'sessionHash' and s.ended_at is null
        returning s.* into impersonation;
      if found then insert into public.loot_manager_impersonation_events(impersonation_id,operation) values(impersonation.id,'exited');end if;
      return jsonb_build_object('ok',true);
    end if;
    actor:=public.loot_manager_operation_v23('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    select * into administrator from public.loot_manager_accounts where id=actor->>'id' and platform_admin and not banned and deletion_requested_at is null;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));end if;
    if p_operation='platform_impersonation_start' then
      select * into target from public.loot_manager_accounts where id=p_data->>'userId' and auth_user_id is not null and not platform_admin and not banned and deletion_requested_at is null;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose an active account that is not a platform administrator.'));end if;
      perform pg_advisory_xact_lock(hashtextextended(administrator.id||':'||(p_data->>'sessionHash'),0));
      update public.loot_manager_impersonations set ended_at=now(),end_reason='replaced' where admin_id=administrator.id and session_hash=p_data->>'sessionHash' and ended_at is null;
      insert into public.loot_manager_impersonations(admin_id,target_id,admin_username,target_username,token_hash,session_hash)
        values(administrator.id,target.id,administrator.username,target.username,p_data->>'tokenHash',p_data->>'sessionHash') returning * into impersonation;
      insert into public.loot_manager_impersonation_events(impersonation_id,operation) values(impersonation.id,'started');
    else
      select * into impersonation from public.loot_manager_impersonations where admin_id=administrator.id and token_hash=p_data->>'tokenHash' and session_hash=p_data->>'sessionHash' and ended_at is null and expires_at>now();
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Impersonation ended or expired. Exit impersonation to continue.'));end if;
      select * into target from public.loot_manager_accounts where id=impersonation.target_id and auth_user_id is not null and not platform_admin and not banned and deletion_requested_at is null;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This account is no longer available for impersonation.'));end if;
    end if;
    return jsonb_build_object('id',impersonation.id,'expiresAt',impersonation.expires_at,
      'user',jsonb_build_object('userId',target.auth_user_id,'email',target.email,'displayName',target.name,'fullName',target.name),
      'target',jsonb_build_object('username',target.username,'name',target.name));
  end if;
  return public.loot_manager_operation_v23(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
