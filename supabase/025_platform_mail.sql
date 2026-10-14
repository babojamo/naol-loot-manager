-- Run after 024 in NAOL only. Durable plan notices and administrator mail delivery records.
begin;
create table if not exists public.loot_manager_mail_jobs(
  id uuid primary key default gen_random_uuid(),actor_id text not null,actor_name text not null,
  kind text not null check(kind in ('plan_change','manual')),subject text,message text,old_plan text,new_plan text,
  status text not null default 'pending' check(status in ('pending','sending','accepted','failed','unconfirmed')),
  created_at timestamptz not null default now(),first_attempt_at timestamptz,claimed_at timestamptz,claim_token uuid,
  last_attempt_by text,attempts integer not null default 0,last_error text,provider_payload jsonb
);
create table if not exists public.loot_manager_mail_recipients(
  job_id uuid not null references public.loot_manager_mail_jobs(id),position integer not null,
  account_id text not null,name text not null,email text not null,provider_id text,
  primary key(job_id,position),unique(job_id,account_id)
);
create index if not exists loot_manager_mail_jobs_created_idx on public.loot_manager_mail_jobs(created_at desc);
alter table public.loot_manager_mail_jobs enable row level security;
alter table public.loot_manager_mail_recipients enable row level security;
revoke all on public.loot_manager_mail_jobs,public.loot_manager_mail_recipients from public,anon,authenticated;
grant select,insert,update on public.loot_manager_mail_jobs,public.loot_manager_mail_recipients to service_role;
do $$ begin
  if to_regprocedure('public.loot_manager_operation_v24(text,jsonb,uuid,jsonb)') is null then
    alter function public.loot_manager_operation(text,jsonb,uuid,jsonb) rename to loot_manager_operation_v24;
  end if;
end $$;
create or replace function public.loot_manager_operation(p_operation text,p_actor jsonb default null,p_guild_id uuid default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor jsonb;result jsonb;target public.loot_manager_accounts%rowtype;job public.loot_manager_mail_jobs%rowtype;
  old_plan text;new_job_id uuid;items jsonb;entry jsonb;page_no integer;pages integer;total integer;n integer;recipient_count integer;
begin
  if p_operation='platform_update' or p_operation like 'platform_mail_%' then
    actor:=public.loot_manager_operation_v24('account',p_actor,null,'{}');if actor ? '_error' then return actor;end if;
    if p_actor ? 'impersonationId' or not coalesce((actor->>'platform_admin')::boolean,false) then
      return jsonb_build_object('_error',jsonb_build_object('status',403,'message','Platform administrator access required. Exit impersonation first.'));
    end if;
    if p_operation='platform_update' then
      select * into target from public.loot_manager_accounts where id=p_data->>'userId' for update;old_plan:=target.plan;
      result:=public.loot_manager_operation_v24(p_operation,p_actor,p_guild_id,p_data);if result ? '_error' then return result;end if;
      select * into target from public.loot_manager_accounts where id=p_data->>'userId';
      if old_plan is distinct from target.plan and old_plan is not null then
        insert into public.loot_manager_mail_jobs(actor_id,actor_name,kind,old_plan,new_plan) values(actor->>'id',actor->>'name','plan_change',old_plan,target.plan) returning id into new_job_id;
        insert into public.loot_manager_mail_recipients(job_id,position,account_id,name,email) values(new_job_id,1,target.id,target.name,target.email);
        result:=result||jsonb_build_object('mailJobId',new_job_id);
      end if;
      return result;
    elsif p_operation='platform_mail_recipient' then
      select jsonb_build_object('id',id,'name',name,'username',username,'email',email) into result from public.loot_manager_accounts where id=p_data->>'userId' and auth_user_id is not null;
      if result is null then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Account not found.'));end if;return result;
    elsif p_operation='platform_mail_create' then
      if jsonb_typeof(p_data->'userIds') is distinct from 'array' or jsonb_array_length(p_data->'userIds') not between 1 and 100
        or length(trim(coalesce(p_data->>'subject',''))) not between 2 and 160 or (p_data->>'subject') ~ E'[\r\n]'
        or length(trim(coalesce(p_data->>'message',''))) not between 2 and 5000 then
        return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Choose 1–100 accounts and enter a subject and message.'));
      end if;
      new_job_id:=(p_data->>'requestId')::uuid;
      perform pg_advisory_xact_lock(hashtextextended(new_job_id::text,25));
      select * into job from public.loot_manager_mail_jobs where id=new_job_id;
      if found then
        select jsonb_agg(account_id order by account_id) into items from public.loot_manager_mail_recipients where job_id=job.id;
        if job.actor_id<>actor->>'id' or job.kind<>'manual' or job.subject<>trim(p_data->>'subject') or job.message<>trim(p_data->>'message')
          or items is distinct from (select jsonb_agg(v order by v) from (select distinct jsonb_array_elements_text(p_data->'userIds') v)t) then
          return jsonb_build_object('_error',jsonb_build_object('status',409,'message','This mail request already exists with different content. Start a new message.'));
        end if;return jsonb_build_object('id',new_job_id);
      end if;
      select count(distinct v) into recipient_count from jsonb_array_elements_text(p_data->'userIds')v;
      select count(*) into n from public.loot_manager_accounts where id in (select jsonb_array_elements_text(p_data->'userIds')) and auth_user_id is not null;
      if n<>recipient_count then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','One or more selected accounts no longer exist. Refresh the recipients.'));end if;
      insert into public.loot_manager_mail_jobs(id,actor_id,actor_name,kind,subject,message) values(new_job_id,actor->>'id',actor->>'name','manual',trim(p_data->>'subject'),trim(p_data->>'message'));
      insert into public.loot_manager_mail_recipients(job_id,position,account_id,name,email)
        select new_job_id,row_number() over(order by id),id,name,email from public.loot_manager_accounts where id in (select jsonb_array_elements_text(p_data->'userIds')) and auth_user_id is not null;
      return jsonb_build_object('id',new_job_id);
    elsif p_operation='platform_mail_list' then
      select count(*) into total from public.loot_manager_mail_jobs;pages:=greatest(1,(total+19)/20);page_no:=least(greatest(coalesce((p_data->>'page')::integer,1),1),pages);
      select coalesce(jsonb_agg(t.item order by t.created_at desc,t.id desc),'[]') into items from (
        select j.id,j.created_at,jsonb_build_object('id',j.id,'kind',j.kind,'subject',j.subject,'oldPlan',j.old_plan,'newPlan',j.new_plan,'status',j.status,'createdAt',j.created_at,'actorName',j.actor_name,
          'count',(select count(*) from public.loot_manager_mail_recipients r where r.job_id=j.id),'accepted',(select count(*) from public.loot_manager_mail_recipients r where r.job_id=j.id and provider_id is not null),'error',j.last_error) item
        from public.loot_manager_mail_jobs j order by created_at desc,id desc limit 20 offset (page_no-1)*20)t;
      return jsonb_build_object('jobs',items,'page',page_no,'pages',pages,'total',total);
    end if;
    select * into job from public.loot_manager_mail_jobs where id=(p_data->>'id')::uuid for update;
    if not found then return jsonb_build_object('_error',jsonb_build_object('status',404,'message','Mail record not found.'));end if;
    if p_operation='platform_mail_get' then
      select coalesce(jsonb_agg(jsonb_build_object('position',position,'accountId',account_id,'name',name,'email',email,'providerId',provider_id) order by position),'[]') into items from public.loot_manager_mail_recipients where job_id=job.id;
      return jsonb_build_object('id',job.id,'kind',job.kind,'subject',job.subject,'message',job.message,'oldPlan',job.old_plan,'newPlan',job.new_plan,'status',job.status,'createdAt',job.created_at,'actorName',job.actor_name,'firstAttemptAt',job.first_attempt_at,'error',job.last_error,'recipients',items);
    elsif p_operation='platform_mail_claim' then
      if job.status='accepted' then return jsonb_build_object('done',true);end if;
      if job.status='sending' and job.claimed_at>now()-interval '3 minutes' then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','This message is already being processed. Refresh its status shortly.'));end if;
      if job.first_attempt_at<now()-interval '23 hours' and job.status in ('sending','unconfirmed') then
        return jsonb_build_object('_error',jsonb_build_object('status',409,'message','Delivery was not confirmed and the safe retry window has ended. Check this message in Resend before creating a replacement.'));
      end if;
      if job.provider_payload is null then
        select count(*) into recipient_count from public.loot_manager_mail_recipients where job_id=job.id;
        if jsonb_typeof(p_data->'payload') is distinct from 'array' or jsonb_array_length(p_data->'payload')<>recipient_count then
          return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Mail recipients could not be prepared.'));
        end if;
        for entry in select value from jsonb_array_elements(p_data->'payload') with ordinality t(value,position)
          join public.loot_manager_mail_recipients r on r.job_id=job.id and r.position=t.position where value->'to' is distinct from jsonb_build_array(r.email) loop
          return jsonb_build_object('_error',jsonb_build_object('status',400,'message','The delivery recipients do not match this mail record.'));
        end loop;
      end if;
      update public.loot_manager_mail_jobs set provider_payload=coalesce(provider_payload,p_data->'payload'),status='sending',claim_token=gen_random_uuid(),claimed_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1,last_attempt_by=actor->>'id',last_error=null where id=job.id returning * into job;
      return jsonb_build_object('token',job.claim_token,'payload',job.provider_payload);
    elsif p_operation='platform_mail_ack' then
      if job.status<>'sending' or job.claim_token is distinct from (p_data->>'token')::uuid then return jsonb_build_object('_error',jsonb_build_object('status',409,'message','This delivery attempt is no longer current. Refresh its status.'));end if;
      if p_data->>'status' not in ('accepted','failed','unconfirmed') then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Invalid delivery result.'));end if;
      if p_data->>'status'='accepted' then
        select count(*) into recipient_count from public.loot_manager_mail_recipients where job_id=job.id;
        if jsonb_typeof(p_data->'providerIds') is distinct from 'array' or jsonb_array_length(p_data->'providerIds')<>recipient_count then return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Incomplete delivery confirmation.'));end if;
        update public.loot_manager_mail_recipients r set provider_id=t.value from jsonb_array_elements_text(p_data->'providerIds') with ordinality t(value,position) where r.job_id=job.id and r.position=t.position;
      end if;
      update public.loot_manager_mail_jobs set status=p_data->>'status',last_error=left(p_data->>'error',500),claim_token=null where id=job.id;
      return jsonb_build_object('ok',true);
    end if;
    return jsonb_build_object('_error',jsonb_build_object('status',400,'message','Unknown mail operation.'));
  end if;
  return public.loot_manager_operation_v24(p_operation,p_actor,p_guild_id,p_data);
end;$$;
revoke all on function public.loot_manager_operation(text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.loot_manager_operation(text,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
