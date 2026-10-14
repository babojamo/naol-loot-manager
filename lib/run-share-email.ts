import {renderNaolEmail,emailTextFooter,emailSubject,naolOrigin} from './email-design.mjs';
type RunInvitation={key:string;from:string;emails:string[];playground:string;dungeon:string;inviter:string;token:string;revision:number};
export function sharedRunEmail(data:RunInvitation,email:string){
  if(!/^[a-f0-9]{64}$/.test(data.token))throw new Error('Invalid shared run link.');
  const url=naolOrigin+'/shared-runs/'+data.token;
  const body=`Hi there,\n\n${data.inviter} shared ${data.dungeon} from ${data.playground} with you on NAOL.\n\nTake a look at the party members, collected loot, sold quantities and current vending prices, all in one place.\n\nSign in or create an account using ${email}, then verify your email address to view this private run.\n\nHappy adventuring,\nThe NAOL team`;
  const note='The link has no expiry; access depends on its current sharing settings. If you were not expecting this message, you can safely ignore it.';
  return {subject:emailSubject('[NAOL] '+data.inviter+' shared a dungeon run with you'),text:`${body}\n\nView the dungeon run:\n${url}\n\n${note}\n\n${emailTextFooter}`,
    html:renderNaolEmail({title:'A dungeon run has been shared with you',eyebrow:'EVERY DROP, ACCOUNTED FOR',preheader:`View ${data.dungeon} from ${data.playground}.`,body,details:[{label:'Playground',value:data.playground},{label:'Dungeon run',value:data.dungeon},{label:'Invited email',value:email}],button:{text:'View shared dungeon run',href:url},note})};
}
export async function sendRunShareEmails(data:RunInvitation,send:typeof fetch=fetch):Promise<string[]>{
  const emails=[...new Set(data.emails)].sort();if(!emails.length)return [];
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(emails.join('\n')));
  const emailHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  try{
    const response=await send('https://api.resend.com/emails/batch',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+data.key,'Content-Type':'application/json','Idempotency-Key':'naol-run-'+data.token+'-'+data.revision+'-'+emailHash},body:JSON.stringify(emails.map(email=>({from:data.from,to:[email],...sharedRunEmail(data,email)}))),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Run invitation delivery failed',response.status);return emails;}
    const result=await response.json() as {data?:Array<{id?:string}>};return emails.filter((_,index)=>!result.data?.[index]?.id);
  }catch{console.error('Run invitation delivery could not be confirmed');return emails;}
}
