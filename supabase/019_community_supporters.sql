-- Run after 018 in the separate NAOL Supabase project, never the Stoics project.
-- Community is stored as 'Free' for compatibility with existing accounts.
begin;

-- End every remaining trial now. Manually assigned plans (cancelled trials) stay intact.
update public.loot_manager_accounts
set plan=case when plan='Elite' then 'Free' else plan end,
    elite_trial_cancelled_at=now(),elite_trial_notice_seen_at=coalesce(elite_trial_notice_seen_at,now())
where elite_trial_started_at is not null and elite_trial_cancelled_at is null;

create or replace function public.loot_manager_limits(account_id text) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
select (case public.loot_manager_effective_plan(id)
  when 'Free' then '{"playgrounds":1,"runs":null,"managers":1}'::jsonb
  when 'Elite' then '{"playgrounds":5,"runs":null,"managers":5}'::jsonb
  else '{"playgrounds":15,"runs":null,"managers":10}'::jsonb end)
  || case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then '{}'::jsonb else limit_overrides end
from public.loot_manager_accounts where id=account_id;
$$;

create table if not exists public.loot_manager_supporters (
  user_id text primary key references public.loot_manager_accounts(id) on delete cascade,
  guild_id uuid references public.loot_manager_guilds(id) on delete set null,
  published boolean not null default false,
  badge text not null default 'Supporter' check(badge in ('Supporter','Elite Supporter','Legend Supporter')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.loot_manager_supporters enable row level security;
revoke all on public.loot_manager_supporters from public,anon,authenticated;
grant select,insert,update,delete on public.loot_manager_supporters to service_role;

do $$ begin
  if to_regprocedure('public.loot_manager_operation_v18(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v18;
  end if;
end $$;

create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;ctx jsonb;g public.loot_manager_guilds%rowtype;actor jsonb;
  account_id text;target_id text;showcase_id uuid;target_plan text;extra jsonb;
  feature text:=p_data->>'feature';page_no integer;pages integer;total integer;search text;
begin
  if p_operation='elite_trial_start' then
    return jsonb_build_object('_error',jsonb_build_object('status',410,'message','Elite trials have ended. Core NAOL features are free on Community.'));
  elsif p_operation='elite_trial_notice' then return jsonb_build_object('expired',false);
  elsif p_operation='supporters_list' then
    search:=left(trim(coalesce(p_data->>'query','')),100);
    page_no:=greatest(1,least(coalesce((p_data->>'page')::integer,1),1000000));
    select count(*) into total from public.loot_manager_supporters s
      join public.loot_manager_accounts a on a.id=s.user_id
      join public.loot_manager_guilds gg on gg.id=s.guild_id
      join public.loot_manager_guild_users m on m.guild_id=gg.id and m.user_id=a.id and m.role='owner'
      where s.published and not a.banned and (search='' or strpos(lower(a.username||' '||gg.name),lower(search))>0);
    pages:=greatest(1,(total+23)/24);page_no:=least(page_no,pages);
    -- Public projection deliberately excludes emails, account IDs, ledger and private settings.
    select coalesce(jsonb_agg(t.item order by t.created_at,t.username),'[]') into result from (
      select jsonb_build_object('username',a.username,'badge',s.badge,'playground',jsonb_build_object(
        'name',gg.name,'slug',gg.slug,'icon',gg.icon,'shopEnabled',gg.shop_enabled,'inquiriesEnabled',gg.inquiries_enabled)) as item,
        s.created_at,a.username
      from public.loot_manager_supporters s join public.loot_manager_accounts a on a.id=s.user_id
      join public.loot_manager_guilds gg on gg.id=s.guild_id
      join public.loot_manager_guild_users m on m.guild_id=gg.id and m.user_id=a.id and m.role='owner'
      where s.published and not a.banned and (search='' or strpos(lower(a.username||' '||gg.name),lower(search))>0)
      order by s.created_at,a.username limit 24 offset (page_no-1)*24
    )t;
    return jsonb_build_object('supporters',result,'total',total,'page',page_no,'pages',pages);
  elsif p_operation in ('platform_supporter_get','platform_supporter_save','platform_update') then
    actor:=public.loot_manager_operation_v18('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    if not coalesce((actor->>'platform_admin')::boolean,false) then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));
    end if;
    target_id:=p_data->>'userId';
    select a.plan into target_plan from public.loot_manager_accounts a where a.id=target_id and a.auth_user_id is not null for update;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;
    if p_operation='platform_supporter_save' then
      showcase_id:=nullif(p_data->>'guildId','')::uuid;
      if p_data->>'badge' is null or p_data->>'badge' not in ('Supporter','Elite Supporter','Legend Supporter') or jsonb_typeof(p_data->'published') is distinct from 'boolean' then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose valid supporter settings.'));
      end if;
      if showcase_id is not null then
        perform 1 from public.loot_manager_guild_users where guild_id=showcase_id and user_id=target_id and role='owner' for update;
        if not found then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a playground owned by this account.'));end if;
      elsif (p_data->>'published')::boolean then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Select a playground before publishing.'));
      end if;
      insert into public.loot_manager_supporters(user_id,guild_id,published,badge) values(target_id,showcase_id,(p_data->>'published')::boolean,p_data->>'badge')
        on conflict(user_id) do update set guild_id=excluded.guild_id,published=excluded.published,badge=excluded.badge,updated_at=now();
      return jsonb_build_object('ok',true);
    elsif p_operation='platform_supporter_get' then
      select jsonb_build_object('guildId',s.guild_id,'published',s.published and s.guild_id is not null,'badge',s.badge) into result from public.loot_manager_supporters s where s.user_id=target_id;
      select coalesce(jsonb_agg(jsonb_build_object('id',gg.id,'name',gg.name,'icon',gg.icon) order by gg.name),'[]') into extra
        from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id and m.user_id=target_id and m.role='owner';
      return coalesce(result,jsonb_build_object('guildId',null,'published',false,'badge',case when target_plan='Elite' then 'Elite Supporter' when target_plan='Legend' then 'Legend Supporter' else 'Supporter' end)) || jsonb_build_object('playgrounds',extra);
    end if;
    -- Apply plan changes without legacy Free-plan code disabling public features.
    if p_data->>'plan' is null or p_data->>'plan' not in ('Free','Elite','Legend') or jsonb_typeof(p_data->'overrides') is distinct from 'object'
      or jsonb_typeof(p_data->'banned') is distinct from 'boolean' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose a valid tier and limits.'));
    end if;
    for extra in select jsonb_build_object('key',key,'value',value) from jsonb_each(p_data->'overrides') loop
      if extra->>'key' not in ('playgrounds','runs','managers') or (extra->'value'<>'null'::jsonb and
        (jsonb_typeof(extra->'value')<>'number' or (extra->>'value') !~ '^[0-9]+$' or (extra->>'value')::numeric>1000000)) then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Limits must be nonnegative integers or unlimited.'));
      end if;
    end loop;
    if target_id=actor->>'id' and (p_data->>'banned')::boolean then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','You cannot ban your own administrator account.'));end if;
    update public.loot_manager_accounts set plan=p_data->>'plan',banned=(p_data->>'banned')::boolean,limit_overrides=p_data->'overrides',
      plan_paused=coalesce((p_data->>'paused')::boolean,false),plan_paused_until=(p_data->>'pausedUntil')::timestamptz,
      discord_override=coalesce((p_data->>'discordOverride')::boolean,discord_override),
      elite_trial_cancelled_at=case when elite_trial_started_at is not null then coalesce(elite_trial_cancelled_at,now()) else elite_trial_cancelled_at end
      where id=target_id;
    return jsonb_build_object('ok',true);
  elsif p_operation='settings_update' then
    ctx:=public.loot_manager_operation_v18('guild_context',p_actor,p_guild_id,'{}');if ctx ? '_error' then return ctx;end if;
    if ctx->>'role'<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the playground owner can change settings.'));end if;
    if length(trim(coalesce(p_data->>'name','')))<2 or length(p_data->>'name')>80 or length(coalesce(p_data->>'description',''))>300
      or length(coalesce(p_data->>'vendorContactMessage',''))>2000
      or jsonb_typeof(p_data->'shopEnabled') is distinct from 'boolean' or jsonb_typeof(p_data->'inquiriesEnabled') is distinct from 'boolean' then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Check the playground settings.'));
    end if;
    update public.loot_manager_guilds set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',''),
      shop_enabled=(p_data->>'shopEnabled')::boolean,inquiries_enabled=(p_data->>'inquiriesEnabled')::boolean,
      vendor_contact_message=case when p_data ? 'vendorContactMessage' then trim(coalesce(p_data->>'vendorContactMessage','')) else vendor_contact_message end,
      is_public=case when (p_data->>'shopEnabled')::boolean or (p_data->>'inquiriesEnabled')::boolean then 1 else 0 end where id=p_guild_id;
    return '{}'::jsonb;
  elsif p_operation='public_list' then
    select coalesce(jsonb_agg(jsonb_build_object('name',gg.name,'slug',gg.slug,'description',gg.description,'icon',gg.icon) order by gg.name),'[]') into result
      from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner'
      join public.loot_manager_accounts a on a.id=m.user_id where not a.banned
      and ((feature='shop' and gg.shop_enabled) or (feature='inquiries' and gg.inquiries_enabled));
    return result;
  elsif p_operation='public_shop' then
    -- Backend-only ledger input; the existing shop API projects stock, prices and public vendor text.
    select coalesce(jsonb_agg(jsonb_build_object('guild',jsonb_build_object('name',gg.name,'slug',gg.slug,'description',gg.description,
      'icon',gg.icon,'inquiries_enabled',gg.inquiries_enabled,'vendor_contact_message',gg.vendor_contact_message),'state',l.payload) order by gg.name),'[]') into result
      from public.loot_manager_guilds gg join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner'
      join public.loot_manager_accounts a on a.id=m.user_id join public.loot_manager_ledgers l on l.guild_id=gg.id
      where gg.shop_enabled and not a.banned and (coalesce(p_data->>'slug','')='' or gg.slug=p_data->>'slug');
    return result;
  elsif p_operation in ('public_guild','public_ledger') then
    if p_operation='public_guild' then select * into g from public.loot_manager_guilds where slug=p_data->>'slug';
    else select * into g from public.loot_manager_guilds where id=p_guild_id;end if;
    if not found or not exists(select 1 from public.loot_manager_guild_users m join public.loot_manager_accounts a on a.id=m.user_id where m.guild_id=g.id and m.role='owner' and not a.banned)
      or (p_operation='public_guild' and not ((feature='shop' and g.shop_enabled) or (feature='inquiries' and g.inquiries_enabled)))
      or (p_operation='public_ledger' and not g.inquiries_enabled) then
      return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This playground has not enabled this public feature.'));
    end if;
    if p_operation='public_guild' then
      return jsonb_build_object('id',g.id,'name',g.name,'slug',g.slug,'description',g.description,'icon',g.icon,'is_public',g.is_public,'shop_enabled',g.shop_enabled,'inquiries_enabled',g.inquiries_enabled);
    end if;
    select jsonb_build_object('state',l.payload,'version',l.version) into result from public.loot_manager_ledgers l where l.guild_id=g.id;
    return result;
  end if;
  -- Existing sharing, catalog, sales, registration, invitations and Discord remain in their current chain.
  return public.loot_manager_operation_v18(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
