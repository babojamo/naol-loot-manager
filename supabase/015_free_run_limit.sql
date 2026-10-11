-- Run after 014 in the NAOL Supabase project.
begin;
create or replace function public.loot_manager_limits(account_id text) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
select (case public.loot_manager_effective_plan(id)
  when 'Free' then '{"playgrounds":1,"runs":200,"managers":0}'::jsonb
  when 'Elite' then '{"playgrounds":5,"runs":null,"managers":5}'::jsonb
  else '{"playgrounds":15,"runs":null,"managers":10}'::jsonb end)
  ||case when plan_paused and (plan_paused_until is null or plan_paused_until>now()) then '{}'::jsonb else limit_overrides end
from public.loot_manager_accounts where id=account_id;
$$;
revoke all on function public.loot_manager_limits(text) from public,anon,authenticated;
grant execute on function public.loot_manager_limits(text) to service_role;
notify pgrst,'reload schema';
commit;
