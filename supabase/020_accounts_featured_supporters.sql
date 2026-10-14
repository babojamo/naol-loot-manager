-- Run after 019 in the separate NAOL project. Includes the automatic 30-day cleanup job.
begin;
alter table public.loot_manager_supporters add column if not exists featured boolean not null default false;
alter table public.loot_manager_supporters add column if not exists featured_order integer not null default 0;
alter table public.loot_manager_accounts add column if not exists deletion_requested_at timestamptz;
alter table public.loot_manager_accounts add column if not exists deletion_due_at timestamptz;
alter table public.loot_manager_accounts add column if not exists deletion_banned_before boolean not null default false;
alter table public.loot_manager_accounts add column if not exists deletion_memberships jsonb not null default '[]';
create index if not exists loot_manager_deletion_due on public.loot_manager_accounts(deletion_due_at) where deletion_due_at is not null;

-- Auth owns email/password changes. This trigger keeps the app profile in the same transaction.
create or replace function public.loot_manager_sync_profile() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.loot_manager_accounts%rowtype;new_name text;new_username text;
begin
  select * into a from public.loot_manager_accounts where auth_user_id=new.id for update;
  if not found then return new;end if;
  if a.deletion_requested_at is not null and (new.email is distinct from old.email or new.raw_user_meta_data is distinct from old.raw_user_meta_data or new.encrypted_password is distinct from old.encrypted_password) then
    raise exception 'This account is pending deletion. Contact NAOL for help.';
  end if;
  new_name:=trim(coalesce(new.raw_user_meta_data->>'name',a.name));
  new_username:=lower(trim(coalesce(new.raw_user_meta_data->>'username',a.username)));
  if length(new_name)<2 or length(new_name)>80 or length(new_username)<3 or length(new_username)>30 then raise exception 'Check your name and username length.';end if;
  update public.loot_manager_accounts set name=new_name,username=new_username,email=lower(new.email),
    email_verified=case when lower(new.email) is distinct from a.email then false else email_verified end where id=a.id;
  return new;
end;$$;
revoke all on function public.loot_manager_sync_profile() from public,anon,authenticated,service_role;
drop trigger if exists loot_manager_sync_auth_profile on auth.users;
create trigger loot_manager_sync_auth_profile after update of email,raw_user_meta_data,encrypted_password on auth.users for each row execute function public.loot_manager_sync_profile();

do $$ begin
  if to_regprocedure('public.loot_manager_operation_v19(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v19;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor jsonb;result jsonb;items jsonb;target public.loot_manager_accounts%rowtype;member jsonb;
  owner_id text;cap integer;n integer;restored integer:=0;skipped integer:=0;showcase_id uuid;rank integer;is_featured boolean;
begin
  -- Even an old browser session cannot use a pending account. Banned also hides all existing public projections.
  if p_actor->>'id' is not null and exists(select 1 from public.loot_manager_accounts where auth_user_id=(p_actor->>'id')::uuid and deletion_requested_at is not null) then
    return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This account is scheduled for deletion. Contact NAOL before the 30-day deadline if you need help.'));
  end if;
  if p_operation='supporters_featured' then
    select coalesce(jsonb_agg(t.item order by t.featured_order,t.created_at,t.username),'[]') into result from (
      select jsonb_build_object('username',a.username,'badge',s.badge,'playground',jsonb_build_object('name',g.name,'slug',g.slug,'icon',g.icon,'shopEnabled',g.shop_enabled,'inquiriesEnabled',g.inquiries_enabled)) as item,
        s.featured_order,s.created_at,a.username
      from public.loot_manager_supporters s join public.loot_manager_accounts a on a.id=s.user_id
      join public.loot_manager_guilds g on g.id=s.guild_id join public.loot_manager_guild_users m on m.guild_id=g.id and m.user_id=a.id and m.role='owner'
      where s.featured and s.published and not a.banned and a.deletion_requested_at is null
      order by s.featured_order,s.created_at,a.username limit 24
    )t;return result;
  elsif p_operation in ('account_profile_check','account_change_gate','account_delete','platform_delete_schedule','platform_restore_account','platform_supporter_save') then
    actor:=public.loot_manager_operation_v19('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    if p_operation like 'platform_%' and not coalesce((actor->>'platform_admin')::boolean,false) then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));
    end if;
    if p_operation='account_change_gate' then
      delete from public.loot_manager_contact_limits where bucket='security:'||(actor->>'id') and expires_at<=now();
      insert into public.loot_manager_contact_limits as l(bucket,attempts,expires_at) values('security:'||(actor->>'id'),1,now()+interval '1 hour')
        on conflict(bucket) do update set attempts=l.attempts+1 returning attempts into n;
      if n>15 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Too many account changes or password checks. Please try again in an hour.'));end if;
      return '{}'::jsonb;
    elsif p_operation='account_profile_check' then
      if exists(select 1 from public.loot_manager_accounts where lower(username)=lower(trim(p_data->>'username')) and id<>actor->>'id') then
        return jsonb_build_object('_error',jsonb_build_object('status',409,'message','That username is already in use.'));
      end if;return '{}'::jsonb;
    elsif p_operation='platform_supporter_save' then
      is_featured:=coalesce((p_data->>'featured')::boolean,false);rank:=coalesce((p_data->>'featuredOrder')::integer,0);
      if rank<0 or rank>999 or (is_featured and not coalesce((p_data->>'published')::boolean,false)) then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Publish the supporter before featuring them. Order must be between 0 and 999.'));
      end if;
      perform pg_advisory_xact_lock(110020);
      if is_featured and (select count(*) from public.loot_manager_supporters where featured and published and user_id<>p_data->>'userId')>=24 then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','The homepage can feature up to 24 supporters. Unfeature another supporter first.'));
      end if;
      result:=public.loot_manager_operation_v19(p_operation,p_actor,p_guild_id,p_data);if result ? '_error' then return result;end if;
      update public.loot_manager_supporters set featured=is_featured,featured_order=rank where user_id=p_data->>'userId';return result;
    end if;
    select * into target from public.loot_manager_accounts where id=case when p_operation='account_delete' then actor->>'id' else p_data->>'userId' end and auth_user_id is not null for update;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;
    if p_operation='platform_restore_account' then
      if target.deletion_requested_at is null then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','This account is not pending deletion.'));end if;
      if target.deletion_due_at<=now() then return jsonb_build_object('_error',jsonb_build_object('status',410,'message','The 30-day recovery period has ended.'));end if;
      update public.loot_manager_accounts set deletion_requested_at=null,deletion_due_at=null,banned=deletion_banned_before where id=target.id;
      -- Recover previous memberships only if the playground still exists and its current owner has capacity.
      for member in select value from jsonb_array_elements(target.deletion_memberships) loop
        select m.user_id into owner_id from public.loot_manager_guild_users m join public.loot_manager_accounts a on a.id=m.user_id
          where m.guild_id=(member->>'guildId')::uuid and m.role='owner' and not a.banned for update of a;
        if owner_id is null or target.deletion_banned_before then skipped:=skipped+1;continue;end if;
        cap:=(public.loot_manager_limits(owner_id)->>'managers')::integer;
        if cap is not null and (select count(*) from public.loot_manager_guild_users where guild_id=(member->>'guildId')::uuid and role<>'owner')>=cap then skipped:=skipped+1;continue;end if;
        insert into public.loot_manager_guild_users(guild_id,user_id,role,joined_at) values((member->>'guildId')::uuid,target.id,'manager',(member->>'joinedAt')::timestamptz) on conflict do nothing;
        restored:=restored+1;
      end loop;
      update public.loot_manager_accounts set deletion_memberships='[]',deletion_banned_before=false where id=target.id;
      return jsonb_build_object('ok',true,'restoredMemberships',restored,'skippedMemberships',skipped);
    end if;
    if p_data->>'confirmation' is distinct from target.username then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Type your account username to confirm deletion.'));end if;
    if p_operation='platform_delete_schedule' and target.id=actor->>'id' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Use Account Settings to delete your own account.'));end if;
    if target.deletion_requested_at is not null then return jsonb_build_object('ok',true,'deletionDueAt',target.deletion_due_at);end if;
    perform pg_advisory_xact_lock(110021);
    if target.platform_admin and not exists(select 1 from public.loot_manager_accounts where id<>target.id and platform_admin and not banned and deletion_requested_at is null) then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','The last active platform administrator cannot be deleted.'));
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('guildId',guild_id,'joinedAt',joined_at)),'[]') into items from public.loot_manager_guild_users where user_id=target.id and role<>'owner';
    update public.loot_manager_accounts set deletion_requested_at=now(),deletion_due_at=now()+interval '30 days',deletion_banned_before=banned,banned=true,deletion_memberships=items where id=target.id;
    delete from public.loot_manager_guild_users where user_id=target.id and role<>'owner';
    delete from public.loot_manager_join_requests where user_id=target.id;
    return jsonb_build_object('ok',true,'deletionDueAt',now()+interval '30 days');
  elsif p_operation='platform_update' then
    actor:=public.loot_manager_operation_v19('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    if not coalesce((actor->>'platform_admin')::boolean,false) then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));end if;
    perform 1 from public.loot_manager_accounts where id=p_data->>'userId' for update;
    if exists(select 1 from public.loot_manager_accounts where id=p_data->>'userId' and deletion_requested_at is not null) then
      return jsonb_build_object('_error',jsonb_build_object('status',409,'message','Restore this account before editing its plan or access.'));
    end if;
  end if;
  result:=public.loot_manager_operation_v19(p_operation,p_actor,p_guild_id,p_data);if result ? '_error' then return result;end if;
  if p_operation='platform_supporter_get' then
    select result||jsonb_build_object('featured',coalesce(s.featured,false),'featuredOrder',coalesce(s.featured_order,0)) into items from public.loot_manager_supporters s where s.user_id=p_data->>'userId';
    return coalesce(items,result||'{"featured":false,"featuredOrder":0}');
  elsif p_operation='platform_users_page' then
    select coalesce(jsonb_agg(t.value||jsonb_build_object('deletion_requested_at',a.deletion_requested_at,'deletion_due_at',a.deletion_due_at) order by t.ord),'[]') into items
      from jsonb_array_elements(result->'users') with ordinality t(value,ord) join public.loot_manager_accounts a on a.id=t.value->>'id';
    return jsonb_set(result,'{users}',items);
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;

-- The existing Auth delete trigger removes owned playgrounds, ledgers and memberships atomically.
-- No browser or website RPC can run the purge; only the database job owner can.
create or replace function public.loot_manager_purge_deleted_accounts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare target record;n integer:=0;
begin
  for target in select id,auth_user_id from public.loot_manager_accounts where deletion_due_at<=now() and deletion_requested_at is not null order by deletion_due_at limit 100 for update skip locked loop
    begin
      delete from auth.users where id=target.auth_user_id;
      if found then n:=n+1;end if;
    exception when others then
      raise warning 'NAOL account purge failed for %, SQLSTATE %',target.id,SQLSTATE;
    end;
  end loop;
  return n;
end;$$;
revoke all on function public.loot_manager_purge_deleted_accounts() from public,anon,authenticated,service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('naol-account-deletion-cleanup','*/15 * * * *','select public.loot_manager_purge_deleted_accounts();');
notify pgrst,'reload schema';
commit;
