type Invitation={key:string;from:string;email:string;playground:string;inviter:string;id:string;joinPath:string};
export async function sendInvitationEmail(data:Invitation,send:typeof fetch=fetch):Promise<boolean>{
  // Use the site's canonical origin, never a visitor-controlled Host header.
  const joinUrl=new URL(data.joinPath,'https://naol.lokwensio.com').href;
  try{
    const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${data.key}`,'Content-Type':'application/json','Idempotency-Key':`naol-invite-${data.id}`},body:JSON.stringify({from:data.from,to:[data.email],subject:`[NAOL] Invitation to ${data.playground}`,text:`${data.inviter} invited you to join ${data.playground} as a manager on NAOL.\n\nAccept your invitation:\n${joinUrl}\n\nThis invitation is valid for seven days. Sign in or create an account using ${data.email}. Registration will continue your invitation.\n\nIf you were not expecting this invitation, you can ignore this email.`}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Invitation delivery failed',response.status);return false;}
    const result=await response.json() as {id?:string};return typeof result.id==='string'&&result.id.length>0;
  }catch{console.error('Invitation delivery could not be confirmed');return false;}
}
