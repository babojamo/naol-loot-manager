-- Run after 011 in the separate NAOL Supabase project.
begin;
alter table public.loot_manager_guilds add column if not exists vendor_contact_message text not null default '' check(length(vendor_contact_message)<=2000);
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v11(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v11;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;items jsonb;
begin
  if p_operation='settings_update' and p_data ? 'vendorContactMessage' and (jsonb_typeof(p_data->'vendorContactMessage')<>'string' or length(p_data->>'vendorContactMessage')>2000) then
    return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Vendor contact message must be at most 2,000 characters.'));
  end if;
  result:=public.loot_manager_operation_v11(p_operation,p_actor,p_guild_id,p_data);
  if result ? '_error' then return result;end if;
  if p_operation='settings_update' and p_data ? 'vendorContactMessage' then
    -- The previous implementation checks owner access and public-feature eligibility.
    update public.loot_manager_guilds set vendor_contact_message=trim(p_data->>'vendorContactMessage') where id=p_guild_id;
  elsif p_operation='settings_get' then
    result:=jsonb_set(result,'{guild,vendor_contact_message}',to_jsonb((select vendor_contact_message from public.loot_manager_guilds where id=p_guild_id)));
  elsif p_operation='public_shop' then
    -- Only rows already approved by shop visibility and owner plan checks are exposed.
    select coalesce(jsonb_agg(jsonb_set(value,'{guild,vendor_contact_message}',to_jsonb(g.vendor_contact_message)) order by ord),'[]'::jsonb) into result from jsonb_array_elements(result) with ordinality as t(value,ord) join public.loot_manager_guilds g on g.slug=value->'guild'->>'slug';
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
