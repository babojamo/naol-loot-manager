-- Run after migrations 001, 002 and 003 in the NEW Supabase project.
begin;
alter table public.loot_manager_accounts add column if not exists plan_paused boolean not null default false;
alter table public.loot_manager_accounts add column if not exists plan_paused_until timestamptz;
alter table public.loot_manager_guilds add column if not exists discord_enabled boolean not null default false;
alter table public.loot_manager_guilds add column if not exists discord_webhook_url text;
create table if not exists public.loot_manager_discord_outbox(
  id uuid primary key default gen_random_uuid(),guild_id uuid not null references public.loot_manager_guilds(id) on delete cascade,
  version integer not null,part integer not null,content text not null,sent_at timestamptz,lease_id uuid,lease_until timestamptz,
  created_at timestamptz not null default now(),unique(guild_id,version,part)
);
alter table public.loot_manager_discord_outbox enable row level security;
revoke all on public.loot_manager_discord_outbox from anon,authenticated;
grant select,insert,update,delete on public.loot_manager_discord_outbox to service_role;
create or replace function public.loot_manager_effective_plan(account_id text) returns text language sql security invoker set search_path=public,pg_temp as $$
select case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then 'Free' else plan end from public.loot_manager_accounts where id=account_id;
$$;
revoke all on function public.loot_manager_effective_plan(text) from public,anon,authenticated;
grant execute on function public.loot_manager_effective_plan(text) to service_role;
create or replace function public.loot_manager_limits(account_id text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
select (case public.loot_manager_effective_plan(id) when 'Free' then '{"playgrounds":1,"runs":5,"managers":0}'::jsonb when 'Elite' then '{"playgrounds":5,"runs":null,"managers":5}'::jsonb else '{"playgrounds":null,"runs":null,"managers":null}'::jsonb end)||case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then '{}'::jsonb else limit_overrides end from public.loot_manager_accounts where id=account_id;
$$;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v3(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v3;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; ctx jsonb; g public.loot_manager_guilds%rowtype; owner_id text; effective text; total integer; cap integer; old_count integer; saved_version integer; message jsonb; part integer:=0; job public.loot_manager_discord_outbox%rowtype; claim uuid; feature text:=p_data->>'feature';
begin
  if p_operation='public_list' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
      select gg.name,gg.slug,gg.description from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner' join public.loot_manager_accounts a on a.id=m.user_id
      where not a.banned and public.loot_manager_effective_plan(a.id) in ('Elite','Legend') and ((feature='shop' and gg.shop_enabled) or (feature='inquiries' and gg.inquiries_enabled)) order by gg.name limit 200)t;return result;
  elsif p_operation in ('public_guild','public_ledger') then
    if p_operation='public_guild' then select * into g from public.loot_manager_guilds where slug=p_data->>'slug';else select * into g from public.loot_manager_guilds where id=p_guild_id;end if;
    select public.loot_manager_effective_plan(m.user_id) into effective from public.loot_manager_guild_users m where m.guild_id=g.id and m.role='owner';
    if effective is null or effective='Free' then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This playground has not enabled this public feature.'));end if;
  elsif p_operation in ('discord_config','discord_claim','discord_ack','ledger_save','settings_update') then
    ctx:=public.loot_manager_operation_v3('guild_context',p_actor,p_guild_id,'{}');if ctx ? '_error' then return ctx;end if;
    select * into g from public.loot_manager_guilds where id=p_guild_id;
    select user_id into owner_id from public.loot_manager_guild_users where guild_id=p_guild_id and role='owner';
    effective:=public.loot_manager_effective_plan(owner_id);
    if p_operation='settings_update' and effective='Free' and ((p_data->>'shopEnabled')::boolean or (p_data->>'inquiriesEnabled')::boolean) then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Public features are disabled on Free and while a plan is paused.'));end if;
    if p_operation='discord_config' then
      if ctx->>'role'<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the owner can configure Discord.'));end if;
      if coalesce(p_data->>'webhookUrl','')<>'' and (p_data->>'webhookUrl') !~ '^https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Enter a valid Discord webhook URL.'));end if;
      if (p_data->>'enabled')::boolean and coalesce(nullif(p_data->>'webhookUrl',''),g.discord_webhook_url) is null then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Set a Discord webhook URL before enabling logs.'));end if;
      update public.loot_manager_guilds set discord_enabled=(p_data->>'enabled')::boolean,discord_webhook_url=case when (p_data->>'clear')::boolean then null else coalesce(nullif(p_data->>'webhookUrl',''),discord_webhook_url) end where id=p_guild_id;
      if (p_data->>'clear')::boolean then update public.loot_manager_guilds set discord_enabled=false where id=p_guild_id;end if;
      if not (p_data->>'enabled')::boolean or (p_data->>'clear')::boolean then delete from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null;end if;
      return '{}'::jsonb;
    elsif p_operation='discord_claim' then
      if not g.discord_enabled or g.discord_webhook_url is null then return 'null'::jsonb;end if;
      select * into job from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null and (lease_until is null or lease_until<now()) order by version,part limit 1 for update skip locked;
      if not found then return 'null'::jsonb;end if;claim:=gen_random_uuid();
      update public.loot_manager_discord_outbox set lease_id=claim,lease_until=now()+interval '30 seconds' where id=job.id;
      return jsonb_build_object('id',job.id,'claim',claim,'content',job.content,'url',g.discord_webhook_url);
    elsif p_operation='discord_ack' then
      update public.loot_manager_discord_outbox set sent_at=case when (p_data->>'success')::boolean then now() else null end,lease_until=now()+interval '1 minute' where id=(p_data->>'id')::uuid and guild_id=p_guild_id and lease_id=(p_data->>'claim')::uuid;return '{}'::jsonb;
    elsif p_operation='ledger_save' then
      select jsonb_array_length(payload->'runs') into old_count from public.loot_manager_ledgers where guild_id=p_guild_id;
      cap:=(public.loot_manager_limits(owner_id)->>'runs')::integer;
      select coalesce(sum(jsonb_array_length(l.payload->'runs')),0) into total from public.loot_manager_ledgers l join public.loot_manager_guild_users m on m.guild_id=l.guild_id and m.role='owner' where m.user_id=owner_id and l.guild_id<>p_guild_id;
      if cap is not null and total+jsonb_array_length(p_data->'state'->'runs')>cap and jsonb_array_length(p_data->'state'->'runs')>old_count then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','The playground owner’s run limit has been reached.'));end if;
      update public.loot_manager_ledgers set payload=p_data->'state',version=version+1,updated_at=now() where guild_id=p_guild_id and version=(p_data->>'version')::integer returning version into saved_version;
      if not found then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','Another manager saved changes. Reload before trying again.'));end if;
      if g.discord_enabled and g.discord_webhook_url is not null then
        for message in select value from jsonb_array_elements(coalesce(p_data->'notifications','[]'::jsonb)) loop
          insert into public.loot_manager_discord_outbox(guild_id,version,part,content) values(p_guild_id,saved_version,part,message#>>'{}');part:=part+1;
        end loop;
      end if;
      return jsonb_build_object('version',saved_version);
    end if;
  end if;
  result:=public.loot_manager_operation_v3(p_operation,p_actor,p_guild_id,p_data);
  if result ? '_error' then return result;end if;
  if p_operation='platform_users' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (select id,email,name,username,plan,limit_overrides,banned,platform_admin,created_at,plan_paused,plan_paused_until,public.loot_manager_effective_plan(id) as "effectivePlan",public.loot_manager_limits(id) as limits from public.loot_manager_accounts where auth_user_id is not null order by created_at desc limit 1000)t;
  elsif p_operation='platform_update' then
    update public.loot_manager_accounts set plan_paused=coalesce((p_data->>'paused')::boolean,false),plan_paused_until=(p_data->>'pausedUntil')::timestamptz where id=p_data->>'userId';
  elsif p_operation='account' then
    result:=result||jsonb_build_object('effectivePlan',public.loot_manager_effective_plan(result->>'id'));
  elsif p_operation='guild_list' then
    select coalesce(jsonb_agg(value-'discord_webhook_url'),'[]'::jsonb) into message from jsonb_array_elements(result->'guilds');
    result:=jsonb_set(result,'{guilds}',message);result:=jsonb_set(result,'{account,effectivePlan}',to_jsonb(public.loot_manager_effective_plan(result->'account'->>'id')));
  elsif p_operation='guild_context' then result:=result-'discord_webhook_url';
  elsif p_operation='settings_get' then
    select * into g from public.loot_manager_guilds where id=p_guild_id;
    select user_id into owner_id from public.loot_manager_guild_users where guild_id=p_guild_id and role='owner';
    result:=jsonb_set(result,'{guild}',((result->'guild')-'discord_webhook_url')||jsonb_build_object('discord_configured',g.discord_webhook_url is not null));
    result:=result||jsonb_build_object('ownerPlan',public.loot_manager_effective_plan(owner_id),'discordPending',(select count(*) from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null));
  end if;
  return result;
end;
$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
commit;
