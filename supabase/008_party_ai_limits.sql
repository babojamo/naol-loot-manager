-- Run after 007 in the separate NAOL Supabase project.
-- No screenshot or API key is stored here; only a hash and extracted names.
begin;
create table if not exists public.loot_manager_party_reads(
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.loot_manager_accounts(id) on delete cascade,
  guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  image_hash text not null,
  read_day date not null default (now() at time zone 'UTC')::date,
  attempts integer not null default 1,
  claim_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  result jsonb,
  unique(user_id,guild_id,image_hash,read_day)
);
alter table public.loot_manager_party_reads enable row level security;
revoke all on public.loot_manager_party_reads from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_party_reads to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v7(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v7;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb; job public.loot_manager_party_reads; today date:=(now() at time zone 'UTC')::date; n integer;
begin
  if p_operation in ('party_read_claim','party_read_finish') then
    ctx:=public.loot_manager_operation_v7('guild_context',p_actor,p_guild_id,'{}');
    if ctx ? '_error' then return ctx;end if;
    if coalesce(ctx->>'role','') not in ('owner','manager') then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only playground managers can read party screenshots.'));end if;
    if p_operation='party_read_finish' then
      update public.loot_manager_party_reads set result=p_data->'result' where id=(p_data->>'id')::uuid and claim_id=(p_data->>'claimId')::uuid and user_id=p_actor->>'id' and guild_id=p_guild_id;
      return '{}'::jsonb;
    end if;
    if coalesce(p_data->>'hash','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Invalid image.'));end if;
    -- One transaction-wide lock makes quotas reliable across concurrent Workers.
    perform pg_advisory_xact_lock(84173008);
    delete from public.loot_manager_party_reads where read_day<today-2;
    select * into job from public.loot_manager_party_reads where user_id=p_actor->>'id' and guild_id=p_guild_id and image_hash=p_data->>'hash' and read_day=today;
    if job.result is not null then return jsonb_build_object('cached',job.result);end if;
    if job.id is not null and job.started_at>now()-interval '90 seconds' then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','This screenshot is already being read. Please wait.'));end if;
    select coalesce(sum(attempts),0) into n from public.loot_manager_party_reads where read_day=today and user_id=p_actor->>'id';
    if n>=25 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Your 25 daily AI screenshot reads are used. You can still enter members manually. Resets at midnight UTC.'));end if;
    select coalesce(sum(attempts),0) into n from public.loot_manager_party_reads where read_day=today;
    if n>=1000 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','The daily AI screenshot budget is used. Please enter members manually today.'));end if;
    insert into public.loot_manager_party_reads as r(user_id,guild_id,image_hash,read_day) values(p_actor->>'id',p_guild_id,p_data->>'hash',today)
      on conflict(user_id,guild_id,image_hash,read_day) do update set attempts=r.attempts+1,started_at=now(),claim_id=gen_random_uuid(),result=null returning * into job;
    return jsonb_build_object('id',job.id,'claimId',job.claim_id);
  end if;
  return public.loot_manager_operation_v7(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
