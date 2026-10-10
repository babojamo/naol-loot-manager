-- Run after 006 in the separate NAOL / Loot Manager Supabase project.
begin;
create or replace function public.loot_manager_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare uname text:=lower(trim(new.raw_user_meta_data->>'username')); display_name text:=trim(new.raw_user_meta_data->>'name');
begin
  if uname is null or length(uname)<3 or length(uname)>30 then raise exception 'Username must be 3-30 characters.';end if;
  if display_name is null or length(display_name)<2 or length(display_name)>80 then raise exception 'Invalid name';end if;
  insert into public.loot_manager_accounts(id,auth_user_id,email,name,username,email_verified,platform_admin) values(new.id::text,new.id,lower(new.email),display_name,uname,false,false);
  return new;
end;$$;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v5(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v5;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_operation='public_shop' then
    -- The backend projects these ledgers to stock and prices before responding.
    select coalesce(jsonb_agg(jsonb_build_object('guild',jsonb_build_object('name',g.name,'slug',g.slug,'description',g.description,'inquiries_enabled',g.inquiries_enabled),'state',l.payload) order by g.name),'[]'::jsonb) into result
    from public.loot_manager_guilds g join public.loot_manager_guild_users m on m.guild_id=g.id and m.role='owner' join public.loot_manager_accounts a on a.id=m.user_id join public.loot_manager_ledgers l on l.guild_id=g.id
    where g.shop_enabled and not a.banned and public.loot_manager_effective_plan(a.id) in ('Elite','Legend') and (coalesce(p_data->>'slug','')='' or g.slug=p_data->>'slug');
    return result;
  end if;
  return public.loot_manager_operation_v5(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
