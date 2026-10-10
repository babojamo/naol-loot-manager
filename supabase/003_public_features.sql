-- Run after 002_playgrounds_accounts_plans.sql. Public features are independent.
begin;
alter table public.loot_manager_guilds add column if not exists shop_enabled boolean not null default false;
alter table public.loot_manager_guilds add column if not exists inquiries_enabled boolean not null default false;
-- Existing public settings remain off until the owner explicitly enables a feature.
update public.loot_manager_guilds set is_public=0 where not shop_enabled and not inquiries_enabled;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v2(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v2;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.loot_manager_guilds%rowtype; owner_plan text; result jsonb; feature text:=p_data->>'feature';
begin
  if p_operation='public_list' then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
      select gg.name,gg.slug,gg.description from public.loot_manager_guilds gg
      join public.loot_manager_guild_users m on m.guild_id=gg.id and m.role='owner'
      join public.loot_manager_accounts a on a.id=m.user_id
      where not a.banned and a.plan in ('Elite','Legend') and
        ((feature='shop' and gg.shop_enabled) or (feature='inquiries' and gg.inquiries_enabled))
      order by gg.name limit 200)t;return result;
  elsif p_operation in ('public_guild','public_ledger') then
    if p_operation='public_guild' then select * into g from public.loot_manager_guilds where slug=p_data->>'slug';else select * into g from public.loot_manager_guilds where id=p_guild_id;end if;
    select a.plan into owner_plan from public.loot_manager_accounts a join public.loot_manager_guild_users m on m.user_id=a.id where m.guild_id=g.id and m.role='owner' and not a.banned;
    if owner_plan is null or owner_plan='Free' or (p_operation='public_guild' and not ((feature='shop' and g.shop_enabled) or (feature='inquiries' and g.inquiries_enabled))) or (not g.shop_enabled and not g.inquiries_enabled) then
      return jsonb_build_object('_error',jsonb_build_object('status',404,'message','This playground has not enabled this public feature.'));
    end if;
    if p_operation='public_guild' then return jsonb_build_object('id',g.id,'name',g.name,'slug',g.slug,'description',g.description,'is_public',g.is_public,'shop_enabled',g.shop_enabled,'inquiries_enabled',g.inquiries_enabled);end if;
  elsif p_operation='settings_update' then
    result:=public.loot_manager_operation_v2('guild_context',p_actor,p_guild_id,'{}');
    if result ? '_error' then return result;end if;
    if result->>'role'<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the playground owner can change settings.'));end if;
    select a.plan into owner_plan from public.loot_manager_accounts a where a.auth_user_id=(p_actor->>'id')::uuid;
    select * into g from public.loot_manager_guilds where id=p_guild_id;
    if owner_plan='Free' and ((p_data->>'shopEnabled')::boolean or (p_data->>'inquiriesEnabled')::boolean) then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Public Shop and Public Inquiries are available on Elite and Legend plans.'));
    end if;
    update public.loot_manager_guilds set name=p_data->>'name',description=p_data->>'description',
      shop_enabled=owner_plan<>'Free' and (p_data->>'shopEnabled')::boolean,
      inquiries_enabled=owner_plan<>'Free' and (p_data->>'inquiriesEnabled')::boolean,
      is_public=case when owner_plan<>'Free' and ((p_data->>'shopEnabled')::boolean or (p_data->>'inquiriesEnabled')::boolean) then 1 else 0 end where id=p_guild_id;
    return '{}'::jsonb;
  elsif p_operation='guild_create' then
    p_data:=p_data||'{"isPublic":false}'::jsonb;
  elsif p_operation='platform_update' and p_data->>'plan'='Free' then
    result:=public.loot_manager_operation_v2(p_operation,p_actor,p_guild_id,p_data);
    if result ? '_error' then return result;end if;
    update public.loot_manager_guilds set shop_enabled=false,inquiries_enabled=false,is_public=0 where id in(select guild_id from public.loot_manager_guild_users where user_id=p_data->>'userId' and role='owner');return result;
  end if;
  return public.loot_manager_operation_v2(p_operation,p_actor,p_guild_id,p_data);
end;
$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
commit;
