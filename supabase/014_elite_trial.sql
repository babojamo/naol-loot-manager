-- Run after 013 in the separate NAOL Supabase project.
begin;
alter table public.loot_manager_accounts add column if not exists elite_trial_started_at timestamptz;
alter table public.loot_manager_accounts add column if not exists elite_trial_ends_at timestamptz;
alter table public.loot_manager_accounts add column if not exists elite_trial_cancelled_at timestamptz;
alter table public.loot_manager_accounts add column if not exists elite_trial_notice_seen_at timestamptz;
create index if not exists loot_manager_trial_expiry on public.loot_manager_accounts(elite_trial_ends_at) where elite_trial_started_at is not null and elite_trial_cancelled_at is null;
create or replace function public.loot_manager_effective_plan(account_id text) returns text language sql security invoker set search_path=public,pg_temp as $$
select case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then 'Free'
 when elite_trial_started_at is not null and elite_trial_cancelled_at is null and elite_trial_ends_at<=now() and plan='Elite' then 'Free'
 else plan end from public.loot_manager_accounts where id=account_id;
$$;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v13(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v13;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;account jsonb;notice timestamptz;old_started timestamptz;old_cancelled timestamptz;old_ends timestamptz;old_plan text;
begin
  -- Enforcement is timestamp-based even before this lazy cleanup runs. No cron is required.
  update public.loot_manager_accounts set plan='Free' where plan='Elite' and elite_trial_cancelled_at is null and elite_trial_ends_at<=now();
  if p_operation in ('elite_trial_start','elite_trial_notice') then
    account:=public.loot_manager_operation_v13('account',p_actor,null,'{}');
    if account ? '_error' then return account;end if;
    if p_operation='elite_trial_start' then
      if account->>'plan'<>'Free' or account->>'effectivePlan'<>'Free' or
        ((account->>'plan_paused')::boolean and ((account->>'plan_paused_until') is null or (account->>'plan_paused_until')::timestamptz>now())) then
        return jsonb_build_object('_error',jsonb_build_object('status',403,'message','The Elite trial is available to active Free accounts only.'));
      end if;
      update public.loot_manager_accounts set plan='Elite',elite_trial_started_at=now(),elite_trial_ends_at=now()+interval '15 days'
        where id=account->>'id' and elite_trial_started_at is null;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','This account has already used its Elite trial.'));end if;
      return public.loot_manager_operation_v13('account',p_actor,null,'{}');
    end if;
    -- Atomic claim makes the popup appear once across devices/tabs, on the next visit after expiry.
    update public.loot_manager_accounts set elite_trial_notice_seen_at=now()
      where id=account->>'id' and elite_trial_ends_at<=now() and elite_trial_cancelled_at is null and elite_trial_notice_seen_at is null
      returning elite_trial_ends_at into notice;
    return jsonb_build_object('expired',notice is not null,'endedAt',notice);
  end if;
  if p_operation='platform_update' then
    select elite_trial_started_at,elite_trial_cancelled_at,elite_trial_ends_at,plan into old_started,old_cancelled,old_ends,old_plan from public.loot_manager_accounts where id=p_data->>'userId' for update;
  end if;
  result:=public.loot_manager_operation_v13(p_operation,p_actor,p_guild_id,p_data);
  if result ? '_error' then return result;end if;
  -- A manually assigned plan replaces the temporary grant. The once-only history is retained.
  if p_operation='platform_update' and old_started is not null and old_cancelled is null and (old_plan is distinct from p_data->>'plan' or coalesce((p_data->>'assignPlan')::boolean,false) or (old_ends<=now() and p_data->>'plan'<>'Free')) then
    update public.loot_manager_accounts set elite_trial_cancelled_at=now() where id=p_data->>'userId';
  elsif p_operation='platform_users_page' then
    select jsonb_set(result,'{users}',coalesce(jsonb_agg(t.value||jsonb_build_object('elite_trial_started_at',a.elite_trial_started_at,'elite_trial_ends_at',a.elite_trial_ends_at,'elite_trial_cancelled_at',a.elite_trial_cancelled_at) order by t.ord),'[]')) into result
      from jsonb_array_elements(result->'users') with ordinality t(value,ord) join public.loot_manager_accounts a on a.id=t.value->>'id';
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;


