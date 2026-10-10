-- Run after 009 in the separate NAOL project.
begin;
alter table public.loot_manager_guilds add column if not exists icon text;
alter table public.loot_manager_discord_outbox add column if not exists last_error text;
alter table public.loot_manager_discord_outbox add column if not exists attempts integer not null default 0;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v9(text,jsonb,uuid,jsonb)') is null then alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v9;end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;ctx jsonb;playground public.loot_manager_guilds%rowtype;job public.loot_manager_discord_outbox%rowtype;claim uuid;n integer;delay integer;items jsonb;
begin
  if p_operation in ('guild_icon_update','discord_status','discord_claim','discord_ack','discord_test') then
    ctx:=public.loot_manager_operation_v9('guild_context',p_actor,p_guild_id,'{}');if ctx ? '_error' then return ctx;end if;
    select * into playground from public.loot_manager_guilds where id=p_guild_id for update;
    if p_operation in ('guild_icon_update','discord_test') and ctx->>'role'<>'owner' then return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Only the owner can change playground icons or test Discord.'));end if;
    if p_operation='guild_icon_update' then
      if p_data->>'icon' is not null and (length(p_data->>'icon')>90000 or (p_data->>'icon') !~ '^data:image/webp;base64,[A-Za-z0-9+/]+=*$') then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Upload a valid playground icon.'));end if;
      update public.loot_manager_guilds set icon=p_data->>'icon' where id=p_guild_id;return '{}'::jsonb;
    elsif p_operation='discord_test' then
      if not playground.discord_enabled or playground.discord_webhook_url is null then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Save and enable a Discord webhook first.'));end if;
      if exists(select 1 from public.loot_manager_discord_outbox where guild_id=p_guild_id and created_at>now()-interval '1 minute' and content like 'NAOL connection test%') then return jsonb_build_object('_error',jsonb_build_object('status',429,'message','Wait one minute before another connection test.'));end if;
      select coalesce(min(version),0)-1 into n from public.loot_manager_discord_outbox where guild_id=p_guild_id and version<0;
      -- Test messages use a separate negative version range from ledger logs.
      insert into public.loot_manager_discord_outbox(guild_id,version,part,content) values(p_guild_id,n,0,'NAOL connection test — Playground: '||playground.name);
      return '{}'::jsonb;
    elsif p_operation='discord_status' then
      select count(*) into n from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null;
      select * into job from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null order by created_at,version,part limit 1;
      return jsonb_build_object('pending',n>0,'pendingCount',n,'error',job.last_error,'retryAt',case when job.lease_until>now() then job.lease_until else null end);
    elsif p_operation='discord_claim' then
      if not playground.discord_enabled or playground.discord_webhook_url is null then return 'null'::jsonb;end if;
      -- A playground-wide lock plus the head job's lease preserve ordering and prevent concurrent sends.
      select * into job from public.loot_manager_discord_outbox where guild_id=p_guild_id and sent_at is null order by created_at,version,part limit 1 for update;
      if not found or job.lease_until>now() then return 'null'::jsonb;end if;
      claim:=gen_random_uuid();update public.loot_manager_discord_outbox set lease_id=claim,lease_until=now()+interval '30 seconds',attempts=attempts+1 where id=job.id;
      return jsonb_build_object('id',job.id,'claim',claim,'content',job.content,'url',playground.discord_webhook_url);
    elsif p_operation='discord_ack' then
      delay:=greatest(1,least(coalesce((p_data->>'retrySeconds')::integer,60),86400));
      update public.loot_manager_discord_outbox set sent_at=case when (p_data->>'success')::boolean then now() else null end,
        last_error=case when (p_data->>'success')::boolean then null else left(p_data->>'error',250) end,
        lease_id=null,lease_until=case when (p_data->>'success')::boolean then null else now()+make_interval(secs=>delay) end
      where id=(p_data->>'id')::uuid and guild_id=p_guild_id and lease_id=(p_data->>'claim')::uuid;return '{}'::jsonb;
    end if;
  end if;
  result:=public.loot_manager_operation_v9(p_operation,p_actor,p_guild_id,p_data);if result ? '_error' then return result;end if;
  if p_operation='discord_config' then
    -- A new webhook clears retry backoff so pending messages can be delivered immediately.
    if coalesce(p_data->>'webhookUrl','')<>'' then update public.loot_manager_discord_outbox set lease_until=null,lease_id=null,last_error=null where guild_id=p_guild_id and sent_at is null and (lease_id is null or lease_until<now());end if;
  elsif p_operation='guild_context' then
    result:=result||jsonb_build_object('icon',(select icon from public.loot_manager_guilds where id=p_guild_id));
  elsif p_operation='settings_get' then
    result:=jsonb_set(result,'{guild,icon}',coalesce(to_jsonb((select icon from public.loot_manager_guilds where id=p_guild_id)),'null'::jsonb));
    result:=result||jsonb_build_object('discordDelivery',public.loot_manager_operation('discord_status',p_actor,p_guild_id,'{}'));
  elsif p_operation='guild_list' then
    select coalesce(jsonb_agg(value||jsonb_build_object('icon',g.icon)),'[]'::jsonb) into items from jsonb_array_elements(result->'guilds') join public.loot_manager_guilds g on g.id=(value->>'id')::uuid;
    result:=jsonb_set(result,'{guilds}',items);
  elsif p_operation='public_list' then
    select coalesce(jsonb_agg(value||jsonb_build_object('icon',g.icon)),'[]'::jsonb) into result from jsonb_array_elements(result) join public.loot_manager_guilds g on g.slug=value->>'slug';
  elsif p_operation='public_guild' then result:=result||jsonb_build_object('icon',(select icon from public.loot_manager_guilds where slug=p_data->>'slug'));
  elsif p_operation='public_shop' then
    select coalesce(jsonb_agg(jsonb_set(value,'{guild,icon}',coalesce(to_jsonb(g.icon),'null'::jsonb))),'[]'::jsonb) into result from jsonb_array_elements(result) join public.loot_manager_guilds g on g.slug=value->'guild'->>'slug';
  end if;
  return result;
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
