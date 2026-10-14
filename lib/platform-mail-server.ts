import {env} from 'cloudflare:workers';
import type {AccountUser} from './account-auth';
import {database} from './supabase-store';
import {ApiError} from './tenant';
import {deliverMailBatch,mailPayload,type MailJob,type MailPayload} from './platform-mail';
export async function sendPlatformMail(id:string,user:AccountUser){
  if(!env.RESEND_API_KEY||!env.CONTACT_FROM_EMAIL)throw new ApiError(503,'Email is not configured. The message is saved; retry it from Admin Mail once the email settings are available.');
  const job=await database<MailJob>('platform_mail_get',user,undefined,{id});
  const claim=await database<{done?:boolean;token:string;payload:MailPayload[]}>('platform_mail_claim',user,undefined,{id,payload:mailPayload(job,env.CONTACT_FROM_EMAIL)});
  if(!claim.done){
    const result=await deliverMailBatch(id,claim.payload,env.RESEND_API_KEY);
    await database('platform_mail_ack',user,undefined,{id,token:claim.token,...result});
  }
  return database<MailJob>('platform_mail_get',user,undefined,{id});
}
