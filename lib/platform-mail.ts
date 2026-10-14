import {renderNaolEmail,emailTextFooter} from './email-design.mjs';
export type MailStatus='pending'|'sending'|'accepted'|'failed'|'unconfirmed';
export type MailRecipient={position:number;accountId:string;name:string;email:string;providerId:string|null};
export type MailJob={id:string;kind:'plan_change'|'manual';subject:string|null;message:string|null;oldPlan:string|null;newPlan:string|null;status:MailStatus;createdAt:string;actorName:string;error:string|null;count?:number;accepted?:number;recipients:MailRecipient[]};
export type MailPayload={from:string;to:string[];reply_to:string;subject:string;text:string;html:string};
const planName=(plan:string|null)=>plan==='Free'?'Community':plan??'Community';
const rank:Record<string,number>={Free:0,Elite:1,Legend:2};
export function mailSubject(job:Pick<MailJob,'kind'|'subject'|'oldPlan'|'newPlan'>){
  if(job.kind==='manual')return job.subject??'A message from NAOL';
  return (rank[job.newPlan??'Free']??0)>(rank[job.oldPlan??'Free']??0)?`Your NAOL plan has been upgraded to ${planName(job.newPlan)}`:'An update to your NAOL plan';
}
export function mailText(job:Pick<MailJob,'kind'|'message'|'oldPlan'|'newPlan'>,name:string){
  if(job.kind==='manual')return job.message??'';
  const greeting=`Hi ${name},`;
  if((rank[job.newPlan??'Free']??0)>(rank[job.oldPlan??'Free']??0))return `${greeting}\n\nWe’re happy to let you know that your NAOL plan has been upgraded from ${planName(job.oldPlan)} to ${planName(job.newPlan)}. Thank you for being part of our community and for supporting the adventures we share.\n\nWe truly appreciate your support. You can review your updated plan in Account Settings and continue managing your playgrounds at your own pace.\n\nIf you have any questions about this change, please reply to this email or contact us. We’ll be glad to help.\n\nWith appreciation,\nThe NAOL team`;
  return `${greeting}\n\nWe’re writing to let you know that your NAOL plan has changed from ${planName(job.oldPlan)} to ${planName(job.newPlan)}. We understand this may be disappointing, and we’re sorry for any inconvenience this change may cause.\n\nYour existing playground records are kept. The limits and features of your current plan now apply, and you can review your account in Account Settings. You remain a valued part of the NAOL community, and we’re grateful to have you with us.\n\nIf this change was unexpected or you would like to discuss your options, please reply to this email or contact us. We’ll be happy to listen and help.\n\nWith care and appreciation,\nThe NAOL team`;
}
export function mailPayload(job:MailJob,from:string):MailPayload[]{
  return job.recipients.map(r=>{
    const subject=mailSubject(job),body=mailText(job,r.name);
    const footer=emailTextFooter;
    return {from,to:[r.email],reply_to:'kevin.loquencio@gmail.com',subject:'[NAOL] '+subject,text:body+'\n\n'+footer,
      html:renderNaolEmail({title:subject,body,eyebrow:job.kind==='plan_change'?'YOUR NAOL PLAN':'A MESSAGE FROM NAOL',button:{text:job.kind==='plan_change'?'Review your plan':'Open NAOL',href:job.kind==='plan_change'?'https://naol.lokwensio.com/account':'https://naol.lokwensio.com/playgrounds'}})};
  });
}
export async function deliverMailBatch(id:string,payload:MailPayload[],key:string,send:typeof fetch=fetch):Promise<{status:'accepted'|'failed'|'unconfirmed';providerIds?:string[];error?:string}>{
  try{
    const response=await send('https://api.resend.com/emails/batch',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'naol-platform-mail-'+id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if(!response.ok){const detail=await response.json().catch(()=>({})) as {message?:string};return {status:[400,401,403,422,429].includes(response.status)?'failed':'unconfirmed',error:`Email service returned ${response.status}. ${(detail.message??'Please check the sender settings and service limits.').slice(0,350)}`};}
    const value=await response.json() as {data?:Array<{id?:string}>};
    if(value.data?.length!==payload.length||value.data.some(v=>typeof v.id!=='string'||!v.id))return {status:'unconfirmed',error:'The email service did not return a complete confirmation. Retry this same record; do not create a duplicate.'};
    return {status:'accepted',providerIds:value.data.map(v=>v.id!)};
  }catch{return {status:'unconfirmed',error:'Delivery could not be confirmed. Retry this same record to check the original request safely.'};}
}
