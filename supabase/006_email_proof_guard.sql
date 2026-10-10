-- Run after 005. Password access must never count as email ownership.
begin;
create or replace function public.loot_manager_confirm_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null and coalesce(new.raw_user_meta_data->>'email_verification_pending','false')<>'true' then
    update public.loot_manager_accounts set email_verified=true,platform_admin=platform_admin or lower(new.email)='kevin.loquencio@gmail.com' where auth_user_id=new.id and email=lower(new.email);
  end if;
  return new;
end;$$;
commit;
