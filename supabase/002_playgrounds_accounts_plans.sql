-- Run after 001_loot_manager.sql in the NEW Supabase project.
begin;
alter table public.loot_manager_accounts add column if not exists auth_user_id uuid unique;
alter table public.loot_manager_accounts add column if not exists username text;
alter table public.loot_manager_accounts add column if not exists plan text not null default 'Free' check(plan in ('Free','Elite','Legend'));
alter table public.loot_manager_accounts add column if not exists limit_overrides jsonb not null default '{}'::jsonb;
alter table public.loot_manager_accounts add column if not exists platform_admin boolean not null default false;
alter table public.loot_manager_accounts add column if not exists banned boolean not null default false;
create unique index if not exists loot_manager_username_unique on public.loot_manager_accounts(lower(username));
alter table public.loot_manager_guilds add column if not exists playground_code text not null default replace(gen_random_uuid()::text,'-','');
create unique index if not exists loot_manager_playground_code_unique on public.loot_manager_guilds(playground_code);
update public.loot_manager_guild_users set role='manager' where role='admin';
update public.loot_manager_invites set role='manager' where role='admin';
create unique index if not exists loot_manager_one_owner on public.loot_manager_guild_users(guild_id) where role='owner';
create table if not exists public.loot_manager_join_requests (
  guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  user_id text not null references public.loot_manager_accounts(id), status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), primary key(guild_id,user_id)
);
alter table public.loot_manager_join_requests enable row level security;
revoke all on public.loot_manager_join_requests from anon,authenticated;
grant select,insert,update,delete on public.loot_manager_join_requests to service_role;

create or replace function public.loot_manager_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare uname text:=lower(trim(new.raw_user_meta_data->>'username')); display_name text:=trim(new.raw_user_meta_data->>'name');
begin
  if uname is null or uname !~ '^[a-z][a-z0-9_]{2,29}$' then raise exception 'Username must be 3-30 letters, numbers or underscores, starting with a letter.'; end if;
  if display_name is null or length(display_name)<2 or length(display_name)>80 then raise exception 'Name must be 2-80 characters.'; end if;
  insert into public.loot_manager_accounts(id,auth_user_id,email,name,username,platform_admin) values(new.id::text,new.id,lower(new.email),display_name,uname,new.email_confirmed_at is not null and lower(new.email)='kevin.loquencio@gmail.com');
  return new;
end;
$$;
revoke all on function public.loot_manager_signup() from public,anon,authenticated;
drop trigger if exists loot_manager_on_signup on auth.users;
create trigger loot_manager_on_signup after insert on auth.users for each row execute function public.loot_manager_signup();
create or replace function public.loot_manager_confirm_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.email_confirmed_at is not null and lower(new.email)='kevin.loquencio@gmail.com' then
    update public.loot_manager_accounts set platform_admin=true where auth_user_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.loot_manager_confirm_admin() from public,anon,authenticated;
drop trigger if exists loot_manager_on_email_verified on auth.users;
create trigger loot_manager_on_email_verified after update of email_confirmed_at on auth.users for each row execute function public.loot_manager_confirm_admin();
update public.loot_manager_accounts a set platform_admin=true from auth.users u where a.auth_user_id=u.id and lower(u.email)='kevin.loquencio@gmail.com' and u.email_confirmed_at is not null;

create or replace function public.loot_manager_limits(account_id text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
select (case plan when 'Free' then '{"playgrounds":1,"runs":5,"managers":0}'::jsonb when 'Elite' then '{"playgrounds":5,"runs":null,"managers":5}'::jsonb else '{"playgrounds":null,"runs":null,"managers":null}'::jsonb end)||limit_overrides from public.loot_manager_accounts where id=account_id;
$$;
revoke all on function public.loot_manager_limits(text) from public,anon,authenticated;
grant execute on function public.loot_manager_limits(text) to service_role;

-- Preserve the original transactional implementation behind a versioned name.
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v1(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v1;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  a public.loot_manager_accounts%rowtype; owner_account public.loot_manager_accounts%rowtype;
  g public.loot_manager_guilds%rowtype; membership text; target_role text; limits jsonb; result jsonb; extra jsonb;
  total integer; cap integer; operation text:=p_operation;
begin
  if operation='username_available' then return jsonb_build_object('available',not exists(select 1 from public.loot_manager_accounts where lower(username)=lower(p_data->>'username'))); end if;
  if operation='public_list' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select gg.name,gg.slug,gg.description from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner' join public.loot_manager_accounts aa on aa.id=m.user_id where gg.is_public=1 and not aa.banned order by gg.name limit 200)t;return result;
  elsif operation in ('public_guild','public_ledger') then
    if operation='public_guild' then select * into g from public.loot_manager_guilds where slug=p_data->>'slug';else select * into g from public.loot_manager_guilds where id=p_guild_id;end if;
    if not found or g.is_public<>1 or exists(select 1 from public.loot_manager_guild_users m join public.loot_manager_accounts aa on aa.id=m.user_id where m.guild_id=g.id and m.role='owner' and aa.banned) then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This playground is not public.'));end if;
    if operation='public_guild' then return jsonb_build_object('id',g.id,'name',g.name,'slug',g.slug,'description',g.description,'is_public',g.is_public);end if;
    return public.loot_manager_operation_v1(operation,null,p_guild_id,p_data);
  end if;
  if p_actor->>'id' is null then return jsonb_build_object('_error',jsonb_build_object('status',401,'message','Sign in to continue.'));end if;
  select * into a from public.loot_manager_accounts where auth_user_id=(p_actor->>'id')::uuid and email=lower(p_actor->>'email') for update;
  if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Complete your account registration.'));end if;
  if a.banned then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Your account has been banned.'));end if;
  p_actor:=p_actor||jsonb_build_object('id',a.id,'name',a.name);
  if operation='account' then return to_jsonb(a)||jsonb_build_object('limits',public.loot_manager_limits(a.id));end if;
  if operation like 'platform_%' then
    if not a.platform_admin then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));end if;
    if operation='platform_users' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select id,email,name,username,plan,limit_overrides,banned,platform_admin,created_at,public.loot_manager_limits(id) as limits from public.loot_manager_accounts where auth_user_id is not null order by created_at desc limit 1000)t;return result;
    elsif operation='platform_update' then
      if p_data->>'plan' not in ('Free','Elite','Legend') or jsonb_typeof(p_data->'overrides')<>'object' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a valid plan and limits.'));end if;
      for extra in select jsonb_build_object('key',key,'value',value) from jsonb_each(p_data->'overrides') loop
        if extra->>'key' not in ('playgrounds','runs','managers') or (extra->'value'<>'null'::jsonb and (jsonb_typeof(extra->'value')<>'number' or (extra->>'value') !~ '^[0-9]+$' or (extra->>'value')::numeric>1000000)) then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Limits must be nonnegative integers or unlimited.'));end if;
      end loop;
      if p_data->>'userId'=a.id and (p_data->>'banned')::boolean then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','You cannot ban your own administrator account.'));end if;
      update public.loot_manager_accounts set plan=p_data->>'plan',limit_overrides=p_data->'overrides',banned=(p_data->>'banned')::boolean where id=p_data->>'userId' and auth_user_id is not null;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;
      return '{}'::jsonb;
    end if;
  end if;
  if operation='guild_create' then
    limits:=public.loot_manager_limits(a.id);cap:=(limits->>'playgrounds')::integer;
    if cap is not null and (select count(*) from public.loot_manager_guild_users where user_id=a.id and role='owner')>=cap then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Your account has reached its playground ownership limit.'));end if;
    -- v1 has an old 20-playground ceiling; handle creation here instead.
    insert into public.loot_manager_guilds(id,name,slug,description,is_public) values((p_data->>'id')::uuid,p_data->>'name',p_data->>'slug',coalesce(p_data->>'description',''),case when (p_data->>'isPublic')::boolean then 1 else 0 end);
    insert into public.loot_manager_guild_users(guild_id,user_id,role) values((p_data->>'id')::uuid,a.id,'owner');
    insert into public.loot_manager_ledgers(guild_id,payload) values((p_data->>'id')::uuid,p_data->'state');return jsonb_build_object('id',p_data->>'id');
  elsif operation='code_join' then
    select * into g from public.loot_manager_guilds where playground_code=p_data->>'code';
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Playground code not found.'));end if;
    if exists(select 1 from public.loot_manager_guild_users where guild_id=g.id and user_id=a.id) then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','You already belong to this playground.'));end if;
    select aa.* into owner_account from public.loot_manager_accounts aa join public.loot_manager_guild_users m on m.user_id=aa.id where m.guild_id=g.id and m.role='owner';
    if owner_account.banned then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This playground is unavailable.'));end if;
    cap:=(public.loot_manager_limits(owner_account.id)->>'managers')::integer;
    if cap=0 then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This playground owner’s plan does not allow managers.'));end if;
    insert into public.loot_manager_join_requests(guild_id,user_id) values(g.id,a.id) on conflict(guild_id,user_id) do update set status='pending',created_at=now();
    return jsonb_build_object('name',g.name);
  elsif operation='guild_list' then
    result:=public.loot_manager_operation_v1(operation,p_actor,p_guild_id,p_data);
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into extra from (select g2.name,r.status from public.loot_manager_join_requests r join public.loot_manager_guilds g2 on g2.id=r.guild_id where r.user_id=a.id and r.status='pending')t;
    return jsonb_build_object('guilds',result,'requests',extra,'account',to_jsonb(a)||jsonb_build_object('limits',public.loot_manager_limits(a.id)));
  elsif operation='invite_accept' then
    select gg.* into g from public.loot_manager_guilds gg join public.loot_manager_invites i on i.guild_id=gg.id where i.token_hash=p_data->>'tokenHash' and i.email=a.email and i.used_by is null and i.expires_at>now();
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Invitation invalid or expired.'));end if;
    p_guild_id:=g.id;
  end if;
  select * into g from public.loot_manager_guilds where id=p_guild_id;
  select aa.* into owner_account from public.loot_manager_accounts aa join public.loot_manager_guild_users m on m.user_id=aa.id where m.guild_id=p_guild_id and m.role='owner' for update of aa;
  if not found or owner_account.banned then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This playground is unavailable.'));end if;
  limits:=public.loot_manager_limits(owner_account.id);
  select role into membership from public.loot_manager_guild_users where guild_id=p_guild_id and user_id=a.id;
  if operation<>'invite_accept' and membership is null then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','You do not have access to this playground.'));end if;
  if operation in ('settings_update','invite_create','invite_revoke','team_remove','team_role','playground_delete','code_rotate','join_approve','join_reject') and membership<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the playground owner can manage users and settings.'));end if;
  if operation='ledger_save' then
    cap:=(limits->>'runs')::integer;
    select coalesce(sum(jsonb_array_length(l.payload->'runs')),0) into total from public.loot_manager_ledgers l join public.loot_manager_guild_users m on m.guild_id=l.guild_id and m.role='owner' where m.user_id=owner_account.id and l.guild_id<>p_guild_id;
    total:=total+jsonb_array_length(p_data->'state'->'runs');
    if cap is not null and total>cap then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','The playground owner’s run limit has been reached.'));end if;
  elsif operation in ('invite_create','invite_accept','join_approve') then
    cap:=(limits->>'managers')::integer;
    select count(*) into total from public.loot_manager_guild_users where guild_id=p_guild_id and role<>'owner';
    if operation='invite_create' then total:=total+(select count(*) from public.loot_manager_invites where guild_id=p_guild_id and used_by is null and expires_at>now());end if;
    if cap is not null and total>=cap then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','The playground owner’s manager limit has been reached.'));end if;
    if operation='invite_create' then p_data:=p_data||'{"role":"manager"}'::jsonb;end if;
  elsif operation='settings_get' then
    result:=public.loot_manager_operation_v1(operation,p_actor,p_guild_id,p_data);
    if membership='owner' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into extra from (select aa.id,aa.name,aa.username,aa.email from public.loot_manager_join_requests r join public.loot_manager_accounts aa on aa.id=r.user_id where r.guild_id=p_guild_id and r.status='pending' and not aa.banned)t;
    else extra:='[]'::jsonb;result:=jsonb_set(result,'{guild,playground_code}','null'::jsonb);end if;
    return result||jsonb_build_object('requests',extra,'ownerPlan',owner_account.plan,'limits',limits);
  end if;
  if operation='join_approve' then
    if not exists(select 1 from public.loot_manager_join_requests r join public.loot_manager_accounts aa on aa.id=r.user_id where r.guild_id=p_guild_id and r.user_id=p_data->>'userId' and r.status='pending' and not aa.banned) then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Join request not found.'));end if;
    insert into public.loot_manager_guild_users(guild_id,user_id,role) values(p_guild_id,p_data->>'userId','manager') on conflict(guild_id,user_id) do nothing;
    update public.loot_manager_join_requests set status='approved' where guild_id=p_guild_id and user_id=p_data->>'userId';return '{}'::jsonb;
  elsif operation='join_reject' then update public.loot_manager_join_requests set status='rejected' where guild_id=p_guild_id and user_id=p_data->>'userId';return '{}'::jsonb;
  elsif operation='code_rotate' then update public.loot_manager_guilds set playground_code=replace(gen_random_uuid()::text,'-','') where id=p_guild_id;return '{}'::jsonb;
  elsif operation='playground_delete' then
    if p_data->>'confirmation'<>g.name then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Type the playground name to confirm deletion.'));end if;
    delete from public.loot_manager_guilds where id=p_guild_id;return '{}'::jsonb;
  elsif operation='team_role' then
    -- Only Owner and Manager exist. Ownership is singular and cannot be assigned by a client.
    if p_data->>'role'<>'manager' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','A playground can have only one owner. Other users are managers.'));end if;
    update public.loot_manager_guild_users set role='manager' where guild_id=p_guild_id and user_id=p_data->>'userId' and role<>'owner';return '{}'::jsonb;
  end if;
  return public.loot_manager_operation_v1(operation,p_actor,p_guild_id,p_data);
exception when unique_violation then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','That username or playground URL is already in use.'));
end;
$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
commit;
