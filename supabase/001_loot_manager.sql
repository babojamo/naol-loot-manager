-- Run in the NEW Supabase project's SQL Editor.
-- No existing data is copied or removed. Browser keys have no direct table access.
begin;
create table if not exists public.loot_manager_accounts (
  id text primary key, email text not null, name text not null, created_at timestamptz not null default now()
);
create table if not exists public.loot_manager_guilds (
  id uuid primary key, name text not null, slug text not null unique,
  description text not null default '', is_public integer not null default 0 check(is_public in (0,1)),
  created_at timestamptz not null default now()
);
create table if not exists public.loot_manager_guild_users (
  guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  user_id text not null references public.loot_manager_accounts(id),
  role text not null check(role in ('owner','admin','manager')), joined_at timestamptz not null default now(),
  primary key(guild_id,user_id)
);
create index if not exists loot_manager_users_by_account on public.loot_manager_guild_users(user_id);
create table if not exists public.loot_manager_ledgers (
  guild_id uuid primary key references public.loot_manager_guilds(id) on delete cascade,
  payload jsonb not null, version integer not null default 0 check(version>=0), updated_at timestamptz not null default now()
);
create table if not exists public.loot_manager_invites (
  id uuid primary key, guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  email text not null, role text not null check(role in ('admin','manager')), token_hash text not null unique,
  created_by text not null references public.loot_manager_accounts(id),
  expires_at timestamptz not null, used_by text references public.loot_manager_accounts(id), created_at timestamptz not null default now()
);
alter table public.loot_manager_accounts enable row level security;
alter table public.loot_manager_guilds enable row level security;
alter table public.loot_manager_guild_users enable row level security;
alter table public.loot_manager_ledgers enable row level security;
alter table public.loot_manager_invites enable row level security;
revoke all on public.loot_manager_accounts, public.loot_manager_guilds, public.loot_manager_guild_users, public.loot_manager_ledgers, public.loot_manager_invites from anon, authenticated;
grant select,insert,update,delete on public.loot_manager_accounts, public.loot_manager_guilds, public.loot_manager_guild_users, public.loot_manager_ledgers, public.loot_manager_invites to service_role;

-- Only the trusted website backend may call this function. ChatGPT identity is
-- supplied by Sites, never accepted from a browser form or client API key.
-- Every operation is one Postgres transaction; no arbitrary SQL is accepted.
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  actor_id text:=p_actor->>'id';
  actor_email text:=lower(p_actor->>'email');
  membership text;
  result jsonb;
  g public.loot_manager_guilds%rowtype;
  invite public.loot_manager_invites%rowtype;
  saved public.loot_manager_ledgers%rowtype;
  new_id uuid;
  target_role text;
begin
  if p_operation='public_list' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select name,slug,description from public.loot_manager_guilds where is_public=1 order by name limit 200) t;
    return result;
  elsif p_operation='public_guild' then
    select * into g from public.loot_manager_guilds where slug=p_data->>'slug' and is_public=1;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This guild has not published its shop and inquiries.')); end if;
    return to_jsonb(g);
  elsif p_operation='public_ledger' then
    select l.* into saved from public.loot_manager_ledgers l join public.loot_manager_guilds gg on gg.id=l.guild_id where gg.id=p_guild_id and gg.is_public=1;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This guild has not published its shop and inquiries.')); end if;
    return jsonb_build_object('state',saved.payload,'version',saved.version);
  end if;
  if actor_id is null or actor_email is null then return jsonb_build_object('_error',jsonb_build_object('status',401,'message','Sign in to continue.')); end if;
  if p_operation='account' then
    insert into public.loot_manager_accounts(id,email,name) values(actor_id,actor_email,p_actor->>'name') on conflict(id) do update set email=excluded.email,name=excluded.name;
    return '{}'::jsonb;
  end if;
  perform 1 from public.loot_manager_accounts where id=actor_id and email=actor_email;
  if not found then return jsonb_build_object('_error',jsonb_build_object('status',401,'message','Sign in to continue.')); end if;
  if p_operation='guild_list' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select gg.*,m.role from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id where m.user_id=actor_id order by gg.name) t;
    return result;
  elsif p_operation='guild_create' then
    perform 1 from public.loot_manager_accounts where id=actor_id for update;
    if (select count(*) from public.loot_manager_guild_users where user_id=actor_id and role='owner')>=20 then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','You can own up to 20 guilds.')); end if;
    new_id:=(p_data->>'id')::uuid;
    insert into public.loot_manager_guilds(id,name,slug,description,is_public) values(new_id,p_data->>'name',p_data->>'slug',coalesce(p_data->>'description',''),case when (p_data->>'isPublic')::boolean then 1 else 0 end);
    insert into public.loot_manager_guild_users(guild_id,user_id,role) values(new_id,actor_id,'owner');
    insert into public.loot_manager_ledgers(guild_id,payload) values(new_id,p_data->'state');
    return jsonb_build_object('id',new_id);
  elsif p_operation='invite_accept' then
    select * into invite from public.loot_manager_invites where token_hash=p_data->>'tokenHash' and email=actor_email and used_by is null and expires_at>now() for update;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This invite has expired, was already used, or belongs to another email address.')); end if;
    insert into public.loot_manager_guild_users(guild_id,user_id,role) values(invite.guild_id,actor_id,invite.role) on conflict(guild_id,user_id) do nothing;
    update public.loot_manager_invites set used_by=actor_id where id=invite.id;
    return jsonb_build_object('guildId',invite.guild_id);
  end if;
  select role into membership from public.loot_manager_guild_users where guild_id=p_guild_id and user_id=actor_id for share;
  if not found then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','You do not have access to this guild.')); end if;
  select * into g from public.loot_manager_guilds where id=p_guild_id;
  if p_operation='guild_context' then return to_jsonb(g)||jsonb_build_object('role',membership);
  elsif p_operation='ledger_get' then
    select * into saved from public.loot_manager_ledgers where guild_id=p_guild_id;
    return jsonb_build_object('state',saved.payload,'version',saved.version);
  elsif p_operation='ledger_save' then
    update public.loot_manager_ledgers set payload=p_data->'state',version=version+1,updated_at=now() where guild_id=p_guild_id and version=(p_data->>'version')::integer returning * into saved;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','Another manager saved changes. Reload the ledger before trying again.')); end if;
    return jsonb_build_object('version',saved.version);
  elsif p_operation='settings_get' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select a.id,a.name,a.email,m.role,m.joined_at from public.loot_manager_guild_users m join public.loot_manager_accounts a on a.id=m.user_id where m.guild_id=p_guild_id order by m.joined_at) t;
    if membership in ('owner','admin') then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into saved.payload from (select id,email,role,expires_at from public.loot_manager_invites where guild_id=p_guild_id and used_by is null and expires_at>now() order by created_at desc) t;
    else saved.payload:='[]'::jsonb; end if;
    return jsonb_build_object('guild',to_jsonb(g)||jsonb_build_object('role',membership),'team',result,'invites',saved.payload,'userId',actor_id);
  end if;
  if membership not in ('owner','admin') then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only guild owners and admins can manage the team.')); end if;
  if p_operation='settings_update' then
    update public.loot_manager_guilds set name=p_data->>'name',description=p_data->>'description',is_public=case when (p_data->>'isPublic')::boolean then 1 else 0 end where id=p_guild_id;
  elsif p_operation='invite_revoke' then
    delete from public.loot_manager_invites where id=(p_data->>'inviteId')::uuid and guild_id=p_guild_id and used_by is null;
  elsif p_operation='team_remove' then
    select role into target_role from public.loot_manager_guild_users where guild_id=p_guild_id and user_id=p_data->>'userId' for update;
    if not found or target_role='owner' or (target_role='admin' and membership<>'owner') then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','This team member cannot be removed by your account.')); end if;
    delete from public.loot_manager_guild_users where guild_id=p_guild_id and user_id=p_data->>'userId';
  elsif p_operation='invite_create' then
    if p_data->>'role'='admin' and membership<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the owner can invite admins.')); end if;
    insert into public.loot_manager_invites(id,guild_id,email,role,token_hash,created_by,expires_at) values((p_data->>'id')::uuid,p_guild_id,lower(p_data->>'email'),p_data->>'role',p_data->>'tokenHash',actor_id,(p_data->>'expiresAt')::timestamptz);
  else return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Unknown guild operation.')); end if;
  return '{}'::jsonb;
exception when unique_violation then
  return jsonb_build_object('_error',jsonb_build_object('status',409,'message','That guild URL or invitation is already in use.'));
end;
$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
commit;
