-- Run after 008 in the separate NAOL Supabase project only.
begin;
create index if not exists loot_manager_accounts_page_order on public.loot_manager_accounts(created_at desc,id);

-- Supabase Auth hard deletion and playground cleanup run in one transaction.
-- Only Auth's trusted backend can delete auth.users; this trigger is not an RPC.
create or replace function public.loot_manager_account_cleanup() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare account_id text; owned uuid[];
begin
  select id into account_id from public.loot_manager_accounts where auth_user_id=old.id for update;
  if account_id is null then return old;end if;
  if exists(select 1 from public.loot_manager_accounts where id=account_id and platform_admin)
     and not exists(select 1 from public.loot_manager_accounts where id<>account_id and platform_admin and not banned) then
    raise exception 'The last active platform administrator cannot be deleted.';
  end if;
  -- Lock ownership rows, preventing concurrent edits during cleanup.
  perform 1 from public.loot_manager_guild_users where user_id=account_id for update;
  select coalesce(array_agg(guild_id),'{}'::uuid[]) into owned from public.loot_manager_guild_users where user_id=account_id and role='owner';
  if to_regclass('public.loot_manager_import_backups') is not null then
    execute 'delete from public.loot_manager_import_backups where guild_id=any($1)' using owned;
  end if;
  delete from public.loot_manager_guilds where id=any(owned);
  -- Other owners' playgrounds and ledger history remain intact.
  delete from public.loot_manager_guild_users where user_id=account_id;
  delete from public.loot_manager_join_requests where user_id=account_id;
  delete from public.loot_manager_invites where created_by=account_id;
  update public.loot_manager_invites set used_by=null where used_by=account_id;
  delete from public.loot_manager_accounts where id=account_id;
  return old;
end;$$;
revoke all on function public.loot_manager_account_cleanup() from public,anon,authenticated,service_role;
drop trigger if exists loot_manager_on_account_delete on auth.users;
create trigger loot_manager_on_account_delete before delete on auth.users for each row execute function public.loot_manager_account_cleanup();

do $$ begin
  if to_regprocedure('public.loot_manager_operation_v8(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v8;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor jsonb; target public.loot_manager_accounts%rowtype; result jsonb; search text; page_no integer; total integer; pages integer;
begin
  if p_operation in ('platform_users_page','platform_delete_check') then
    actor:=public.loot_manager_operation_v8('account',p_actor,null,'{}');
    if actor ? '_error' then return actor;end if;
    if not coalesce((actor->>'platform_admin')::boolean,false) then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));
    end if;
    if p_operation='platform_delete_check' then
      select * into target from public.loot_manager_accounts where id=p_data->>'userId' and auth_user_id is not null;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;
      if target.id=actor->>'id' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','You cannot delete your own administrator account.'));end if;
      if p_data->>'confirmation' is distinct from target.username then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Type the account username to confirm deletion.'));
      end if;
      return jsonb_build_object('authUserId',target.auth_user_id);
    end if;
    search:=left(trim(coalesce(p_data->>'query','')),200);
    page_no:=greatest(1,least(coalesce((p_data->>'page')::integer,1),1000000));
    select count(*) into total from public.loot_manager_accounts a where auth_user_id is not null
      and (search='' or strpos(lower(concat_ws(' ',a.name,a.username,a.email)),lower(search))>0);
    pages:=greatest(1,(total+19)/20);page_no:=least(page_no,pages);
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into result from (
      select a.id,a.email,a.name,a.username,a.plan,a.limit_overrides,a.banned,a.platform_admin,a.created_at,a.plan_paused,a.plan_paused_until,
        public.loot_manager_effective_plan(a.id) as "effectivePlan",public.loot_manager_limits(a.id) as limits,
        (select count(*) from public.loot_manager_guild_users m where m.user_id=a.id and m.role='owner') as "ownedPlaygroundCount"
      from public.loot_manager_accounts a where auth_user_id is not null
        and (search='' or strpos(lower(concat_ws(' ',a.name,a.username,a.email)),lower(search))>0)
      order by a.created_at desc,a.id limit 20 offset (page_no-1)*20
    )t;
    return jsonb_build_object('users',result,'total',total,'page',page_no,'pageSize',20,'pages',pages,'actorId',actor->>'id');
  end if;
  return public.loot_manager_operation_v8(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
