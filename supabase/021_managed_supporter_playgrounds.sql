-- Run after 020 in NAOL only. Allows an active owner OR manager membership for showcases.
begin;
create or replace function public.loot_manager_showcase_eligible(account_id text,playground_id uuid)
returns boolean language sql security invoker set search_path=public,pg_temp as $$
select exists(
  select 1 from public.loot_manager_guild_users m
  join public.loot_manager_accounts a on a.id=m.user_id
  join public.loot_manager_guild_users own on own.guild_id=m.guild_id and own.role='owner'
  join public.loot_manager_accounts owner_account on owner_account.id=own.user_id
  where m.user_id=account_id and m.guild_id=playground_id and m.role in ('owner','manager')
    and not a.banned and a.deletion_requested_at is null
    and not owner_account.banned and owner_account.deletion_requested_at is null
);
$$;
revoke all on function public.loot_manager_showcase_eligible(text,uuid) from public,anon,authenticated;
grant execute on function public.loot_manager_showcase_eligible(text,uuid) to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v20(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v20;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor jsonb;target public.loot_manager_accounts%rowtype;showcase public.loot_manager_supporters%rowtype;
  result jsonb;playgrounds jsonb;selected_id uuid;is_featured boolean;rank integer;page_no integer;pages integer;total integer;search text;
begin
  if p_operation in ('platform_supporter_get','platform_supporter_save') then
    actor:=public.loot_manager_operation_v20('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    if not coalesce((actor->>'platform_admin')::boolean,false) then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required.'));end if;
    select * into target from public.loot_manager_accounts where id=p_data->>'userId' and auth_user_id is not null for update;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;
    if p_operation='platform_supporter_get' then
      select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'icon',g.icon,'role',m.role) order by case when m.role='owner' then 0 else 1 end,lower(g.name),g.id),'[]') into playgrounds
        from public.loot_manager_guilds g join public.loot_manager_guild_users m on m.guild_id=g.id and m.user_id=target.id
        where public.loot_manager_showcase_eligible(target.id,g.id);
      select * into showcase from public.loot_manager_supporters where user_id=target.id;
      selected_id:=case when public.loot_manager_showcase_eligible(target.id,showcase.guild_id) then showcase.guild_id else null end;
      return jsonb_build_object('playgrounds',playgrounds,'guildId',selected_id,'published',selected_id is not null and coalesce(showcase.published,false),
        'badge',coalesce(showcase.badge,case target.plan when 'Elite' then 'Elite Supporter' when 'Legend' then 'Legend Supporter' else 'Supporter' end),
        'featured',selected_id is not null and coalesce(showcase.published and showcase.featured,false),'featuredOrder',coalesce(showcase.featured_order,0));
    end if;
    selected_id:=nullif(p_data->>'guildId','')::uuid;
    is_featured:=coalesce((p_data->>'featured')::boolean,false);rank:=coalesce((p_data->>'featuredOrder')::integer,0);
    if p_data->>'badge' is null or p_data->>'badge' not in ('Supporter','Elite Supporter','Legend Supporter') or jsonb_typeof(p_data->'published') is distinct from 'boolean'
      or rank<0 or rank>999 or (is_featured and not (p_data->>'published')::boolean) then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose valid supporter settings. Publish the supporter before featuring them.'));
    end if;
    if selected_id is not null then
      -- Lock membership through saving. Pending join requests and unrelated playgrounds are ineligible.
      perform 1 from public.loot_manager_guild_users where guild_id=selected_id and user_id=target.id and role in ('owner','manager') for update;
      if not found or not public.loot_manager_showcase_eligible(target.id,selected_id) then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose an active playground this account owns or manages.'));
      end if;
    elsif (p_data->>'published')::boolean then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Select a playground before publishing.'));
    end if;
    perform pg_advisory_xact_lock(110020);
    if is_featured and (select count(*) from public.loot_manager_supporters where featured and published and user_id<>target.id)>=24 then
      return jsonb_build_object('_error',jsonb_build_object('status',400,'message','The homepage can feature up to 24 supporters. Unfeature another supporter first.'));
    end if;
    insert into public.loot_manager_supporters(user_id,guild_id,published,badge,featured,featured_order)
      values(target.id,selected_id,(p_data->>'published')::boolean,p_data->>'badge',is_featured,rank)
      on conflict(user_id) do update set guild_id=excluded.guild_id,published=excluded.published,badge=excluded.badge,featured=excluded.featured,featured_order=excluded.featured_order,updated_at=now();
    return jsonb_build_object('ok',true);
  elsif p_operation in ('supporters_list','supporters_featured') then
    search:=left(trim(coalesce(p_data->>'query','')),100);
    page_no:=greatest(1,least(coalesce((p_data->>'page')::integer,1),1000000));
    select count(*) into total from public.loot_manager_supporters s
      join public.loot_manager_accounts a on a.id=s.user_id join public.loot_manager_guilds g on g.id=s.guild_id
      where s.published and public.loot_manager_showcase_eligible(a.id,g.id)
      and (p_operation<>'supporters_featured' or s.featured)
      and (search='' or strpos(lower(a.username||' '||g.name),lower(search))>0);
    pages:=greatest(1,(total+23)/24);page_no:=case when p_operation='supporters_featured' then 1 else least(page_no,pages) end;
    select coalesce(jsonb_agg(t.item order by t.display_order,t.created_at,t.username),'[]') into result from (
      select jsonb_build_object('username',a.username,'badge',s.badge,'playground',jsonb_build_object('name',g.name,'slug',g.slug,'icon',g.icon,'shopEnabled',g.shop_enabled,'inquiriesEnabled',g.inquiries_enabled)) as item,
        case when p_operation='supporters_featured' then s.featured_order else 0 end as display_order,s.created_at,a.username
      from public.loot_manager_supporters s join public.loot_manager_accounts a on a.id=s.user_id join public.loot_manager_guilds g on g.id=s.guild_id
      where s.published and public.loot_manager_showcase_eligible(a.id,g.id)
      and (p_operation<>'supporters_featured' or s.featured)
      and (search='' or strpos(lower(a.username||' '||g.name),lower(search))>0)
      order by display_order,s.created_at,a.username limit 24 offset (page_no-1)*24
    )t;
    if p_operation='supporters_featured' then return result;end if;
    return jsonb_build_object('supporters',result,'total',total,'page',page_no,'pages',pages);
  end if;
  -- Keep account deletion, recovery, cleanup, sharing, settings and ledger behavior unchanged.
  return public.loot_manager_operation_v20(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
