-- Run after 004 in the NEW Loot Manager Supabase project only.
begin;
alter table public.loot_manager_accounts add column if not exists email_verified boolean;
-- Preserve proof for accounts registered under the previous confirmation flow.
update public.loot_manager_accounts a set email_verified=coalesce(u.email_confirmed_at is not null,false) from auth.users u where a.auth_user_id=u.id and a.email_verified is null;
update public.loot_manager_accounts set email_verified=false where email_verified is null;
alter table public.loot_manager_accounts alter column email_verified set default false;
alter table public.loot_manager_accounts alter column email_verified set not null;
create or replace function public.loot_manager_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare uname text:=lower(trim(new.raw_user_meta_data->>'username')); display_name text:=trim(new.raw_user_meta_data->>'name');
begin
  if uname is null or uname !~ '^[a-z][a-z0-9_]{2,29}$' then raise exception 'Invalid username';end if;
  if display_name is null or length(display_name)<2 or length(display_name)>80 then raise exception 'Invalid name';end if;
  -- Allowing password login is not evidence of email ownership.
  insert into public.loot_manager_accounts(id,auth_user_id,email,name,username,email_verified,platform_admin) values(new.id::text,new.id,lower(new.email),display_name,uname,false,false);
  return new;
end;$$;
create or replace function public.loot_manager_confirm_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.loot_manager_accounts set email_verified=true,platform_admin=platform_admin or lower(new.email)='kevin.loquencio@gmail.com' where auth_user_id=new.id and email=lower(new.email);
  end if;
  return new;
end;$$;
create table if not exists public.loot_manager_registration_limits(bucket text primary key,attempts integer not null,expires_at timestamptz not null);
alter table public.loot_manager_registration_limits enable row level security;
revoke all on public.loot_manager_registration_limits from anon,authenticated;
grant select,insert,update,delete on public.loot_manager_registration_limits to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v4(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v4;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb; a jsonb; g jsonb; team jsonb; invites jsonb:='[]'::jsonb; requests jsonb:='[]'::jsonb; owner_id text; count_attempts integer;
begin
  if p_operation='registration_gate' then
    delete from public.loot_manager_registration_limits r where r.expires_at<now();
    insert into public.loot_manager_registration_limits as r(bucket,attempts,expires_at) values(p_data->>'bucket',1,now()+interval '1 hour') on conflict(bucket) do update set attempts=r.attempts+1 returning attempts into count_attempts;
    if count_attempts>10 then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Too many registration attempts. Please try again later.'));end if;
    return '{}'::jsonb;
  elsif p_operation='email_verify' then
    a:=public.loot_manager_operation_v4('account',p_actor,null,'{}');if a ? '_error' then return a;end if;
    -- Called only by the backend after exchanging an emailed one-time link.
    update public.loot_manager_accounts x set email_verified=true,platform_admin=x.platform_admin or x.email='kevin.loquencio@gmail.com' where x.id=a->>'id';return '{}'::jsonb;
  elsif p_operation='settings_get' then
    ctx:=public.loot_manager_operation_v4('guild_context',p_actor,p_guild_id,'{}');if ctx ? '_error' then return ctx;end if;
    select to_jsonb(x)-'discord_webhook_url'||jsonb_build_object('role',ctx->>'role','discord_configured',x.discord_webhook_url is not null) into g from public.loot_manager_guilds x where x.id=p_guild_id;
    select m.user_id into owner_id from public.loot_manager_guild_users m where m.guild_id=p_guild_id and m.role='owner';
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into team from (select x.id,x.name,x.email,m.role,m.joined_at from public.loot_manager_guild_users m join public.loot_manager_accounts x on x.id=m.user_id where m.guild_id=p_guild_id order by m.joined_at)t;
    if ctx->>'role'='owner' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into invites from (select i.id,i.email,i.role,i.expires_at from public.loot_manager_invites i where i.guild_id=p_guild_id and i.used_by is null and i.expires_at>now() order by i.created_at desc)t;
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into requests from (select x.id,x.name,x.username,x.email from public.loot_manager_join_requests r join public.loot_manager_accounts x on x.id=r.user_id where r.guild_id=p_guild_id and r.status='pending' and not x.banned)t;
    else g:=jsonb_set(g,'{playground_code}','null'::jsonb);end if;
    return jsonb_build_object('guild',g,'team',team,'invites',invites,'requests',requests,'userId',p_actor->>'id','ownerPlan',public.loot_manager_effective_plan(owner_id),'limits',public.loot_manager_limits(owner_id),'discordPending',(select count(*) from public.loot_manager_discord_outbox o where o.guild_id=p_guild_id and o.sent_at is null));
  end if;
  return public.loot_manager_operation_v4(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
