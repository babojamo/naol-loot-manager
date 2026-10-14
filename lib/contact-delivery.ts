import {renderNaolEmail,emailTextFooter,emailSubject} from './email-design.mjs';
type Contact={key:string;from:string;email:string;subject:string;message:string;requestId:string;account?:string};
export function contactEmail(data:Contact){
  return {subject:emailSubject(`[NAOL] ${data.subject}`),text:`A new message was submitted through the NAOL contact form.\n\nFrom: ${data.email}\nSigned-in account: ${data.account??'Guest'}\nSubject: ${data.subject}\n\n${data.message}\n\nReply to this email to respond to the sender.\n\n${emailTextFooter}`,
    html:renderNaolEmail({title:data.subject,eyebrow:'NAOL CONTACT FORM',preheader:`A new contact message from ${data.email}.`,body:`A player sent the following message through the NAOL contact form.\n\n${data.message}`,details:[{label:'Reply to',value:data.email},{label:'Signed-in account',value:data.account??'Guest'}],note:'Use Reply in your email app to respond directly to the sender. This message contains content submitted by the sender.'})};
}
export async function sendContactEmail(data:Contact,send:typeof fetch=fetch):Promise<boolean>{
  try{
    const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${data.key}`,'Content-Type':'application/json','Idempotency-Key':`naol-contact-${data.requestId}`},body:JSON.stringify({from:data.from,to:['kevin.loquencio@gmail.com'],reply_to:data.email,...contactEmail(data)}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Contact delivery failed',response.status);return false;}
    const result=await response.json() as {id?:string};return typeof result.id==='string'&&result.id.length>0;
  }catch{console.error('Contact delivery could not be confirmed');return false;}
}
