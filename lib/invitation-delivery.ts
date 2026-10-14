import {renderNaolEmail,emailTextFooter,emailSubject,naolOrigin} from './email-design.mjs';
type Invitation={key:string;from:string;email:string;playground:string;inviter:string;id:string;joinPath:string};
export function invitationEmail(data:Invitation){
  const url=new URL(data.joinPath,naolOrigin);
  if(url.origin!==naolOrigin||url.pathname!=='/join'||!/^[a-f0-9]{64}$/.test(url.searchParams.get('token')??''))throw new Error('Invalid playground invitation link.');
  const body=`Hi there,\n\n${data.inviter} invited you to join ${data.playground} as a manager on NAOL. Your party can keep dungeon runs, shared loot and salaries together in one place.\n\nSign in or create an account using ${data.email}. Registration will continue your invitation, so you can pick up where you left off.\n\nWe look forward to welcoming you to the playground.\n\nThe NAOL team`;
  const note='This invitation is valid for seven days. If you were not expecting it, you can safely ignore this email.';
  return {subject:emailSubject(`[NAOL] Invitation to ${data.playground}`),text:`${body}\n\nAccept your invitation:\n${url.href}\n\n${note}\n\n${emailTextFooter}`,
    html:renderNaolEmail({title:`You’re invited to ${data.playground}`,eyebrow:'YOUR PARTY IS WAITING',preheader:`${data.inviter} invited you to manage ${data.playground} on NAOL.`,body,details:[{label:'Playground',value:data.playground},{label:'Invited email',value:data.email}],button:{text:'Accept playground invitation',href:url.href},note})};
}
export async function sendInvitationEmail(data:Invitation,send:typeof fetch=fetch):Promise<boolean>{
  try{
    const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${data.key}`,'Content-Type':'application/json','Idempotency-Key':`naol-invite-${data.id}`},body:JSON.stringify({from:data.from,to:[data.email],...invitationEmail(data)}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Invitation delivery failed',response.status);return false;}
    const result=await response.json() as {id?:string};return typeof result.id==='string'&&result.id.length>0;
  }catch{console.error('Invitation delivery could not be confirmed');return false;}
}
