-- Run after 015 in the separate NAOL Supabase project.
begin;
create table if not exists public.loot_manager_run_shares (
  guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  run_id text not null, token text not null unique check(token ~ '^[a-f0-9]{64}$'),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check(mode in ('public','restricted','disabled')),
  emails text[] not null default '{}', revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(guild_id,run_id), check(cardinality(emails)<=20),
  check(mode<>'restricted' or cardinality(emails)>0)
);
-- The recoverable link is stored only in a server-accessible table. Browser keys
-- cannot read it or call the RPC. Lookups use the SHA-256 hash of the random token.
alter table public.loot_manager_run_shares enable row level security;
revoke all on public.loot_manager_run_shares from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_run_shares to service_role;
create table if not exists public.loot_manager_share_email_limits (
  account_id text not null references public.loot_manager_accounts(id) on delete cascade,
  hour timestamptz not null, count integer not null default 0, primary key(account_id,hour)
);
alter table public.loot_manager_share_email_limits enable row level security;
revoke all on public.loot_manager_share_email_limits from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_share_email_limits to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v14(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v14;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.loot_manager_run_shares%rowtype; result jsonb; a jsonb; payload jsonb; g jsonb;
  recipients text[]; notify_emails text[]:='{}'; desired text; used integer; slot timestamptz:=date_trunc('hour',now());
begin
  if p_operation in ('run_share_get','run_share_save') then
    result:=public.loot_manager_operation_v14('guild_context',p_actor,p_guild_id,'{}');
    if result ? '_error' then return result;end if;
    if result->>'role' not in ('owner','manager') then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Playground manager access required.'));end if;
    select l.payload into payload from public.loot_manager_ledgers l where l.guild_id=p_guild_id;
    if not exists(select 1 from jsonb_array_elements(coalesce(payload->'runs','[]')) r where r->>'id'=p_data->>'runId') then
      return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Save this dungeon run before sharing it.'));
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_guild_id::text||':'||(p_data->>'runId'),0));
    select * into s from public.loot_manager_run_shares where guild_id=p_guild_id and run_id=p_data->>'runId' for update;
    if p_operation='run_share_get' then return jsonb_build_object('share',case when s.run_id is null then null else to_jsonb(s)-'token_hash'-'guild_id'-'run_id' end);end if;
    desired:=p_data->>'mode';
    if desired is null or desired not in ('public','restricted','disabled') or jsonb_typeof(p_data->'emails') is distinct from 'array' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a sharing option and valid email addresses.'));
    end if;
    select coalesce(array_agg(distinct lower(trim(e))),'{}') into recipients from jsonb_array_elements_text(p_data->'emails') e;
    if cardinality(recipients)>20 or exists(select 1 from unnest(recipients) e where length(e)>200 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (desired='restricted' and cardinality(recipients)=0) then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Enter 1–20 valid recipient email addresses.'));
    end if;
    if coalesce((p_data->>'revision')::integer,0)<>coalesce(s.revision,0) then
      return jsonb_build_object('_error',jsonb_build_object('status',409,'message','Sharing changed in another window. Close and reopen Share to reload it.'));
    end if;
    if desired='restricted' then
      select coalesce(array_agg(e),'{}') into notify_emails from unnest(recipients) e where s.mode is distinct from 'restricted' or not(e=any(s.emails));
    else recipients:='{}';end if;
    if cardinality(notify_emails)>0 then
      -- Serialize per-account notification allowance before modifying the share.
      perform 1 from public.loot_manager_accounts where id=p_actor->>'id' for update;
      select count into used from public.loot_manager_share_email_limits where account_id=p_actor->>'id' and hour=slot;
      if coalesce(used,0)+cardinality(notify_emails)>50 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','You can email up to 50 run invitations per hour. Please try again later.'));end if;
      insert into public.loot_manager_share_email_limits(account_id,hour,count) values(p_actor->>'id',slot,cardinality(notify_emails))
        on conflict(account_id,hour) do update set count=loot_manager_share_email_limits.count+excluded.count;
      delete from public.loot_manager_share_email_limits where hour<now()-interval '2 days';
    end if;
    if s.run_id is null then
      if coalesce(p_data->>'token','') !~ '^[a-f0-9]{64}$' or coalesce(p_data->>'tokenHash','') !~ '^[a-f0-9]{64}$' then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Invalid share token.'));
      end if;
      insert into public.loot_manager_run_shares(guild_id,run_id,token,token_hash,mode,emails)
        values(p_guild_id,p_data->>'runId',p_data->>'token',p_data->>'tokenHash',desired,recipients) returning * into s;
    else
      update public.loot_manager_run_shares set mode=desired,emails=recipients,revision=revision+1,updated_at=now()
        where guild_id=p_guild_id and run_id=s.run_id returning * into s;
    end if;
    return jsonb_build_object('share',to_jsonb(s)-'token_hash'-'guild_id'-'run_id','notifyEmails',to_jsonb(notify_emails));
  elsif p_operation in ('run_share_view','run_share_preview') then
    select * into s from public.loot_manager_run_shares where token_hash=p_data->>'tokenHash' and mode<>'disabled';
    if s.run_id is null then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This shared run is unavailable.'));end if;
    select jsonb_build_object('name',gg.name,'icon',gg.icon) into g from public.loot_manager_guilds gg
      join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner'
      join public.loot_manager_accounts aa on aa.id=m.user_id where gg.id=s.guild_id and not aa.banned;
    select l.payload into payload from public.loot_manager_ledgers l where l.guild_id=s.guild_id;
    if g is null or not exists(select 1 from jsonb_array_elements(coalesce(payload->'runs','[]')) r where r->>'id'=s.run_id) then
      return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This shared run is unavailable.'));
    end if;
    if s.mode='restricted' then
      -- Social crawlers never receive restricted details, even with a session.
      if p_operation='run_share_preview' then return jsonb_build_object('restricted',true);end if;
      if p_actor is null then return jsonb_build_object('_error',jsonb_build_object('status',401,'message','Sign in using an invited email address to view this run.'));end if;
      a:=public.loot_manager_operation_v14('account',p_actor,null,'{}');
      if a ? '_error' then return a;end if;
      if not(lower(a->>'email')=any(s.emails)) then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This run is shared with specific email addresses. Your account does not have access.'));end if;
      if not coalesce((a->>'email_verified')::boolean,false) then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Verify your email address before opening this shared run.'));end if;
    end if;
    -- Internal backend-only result; the website projects just the selected run.
    return jsonb_build_object('guild',g,'runId',s.run_id,'state',payload,'restricted',s.mode='restricted');
  end if;
  return public.loot_manager_operation_v14(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
