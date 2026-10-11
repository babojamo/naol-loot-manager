type RunInvitation={key:string;from:string;emails:string[];playground:string;dungeon:string;inviter:string;token:string;revision:number};
// Batch delivery keeps recipients private and avoids one simultaneous API request per email.
export async function sendRunShareEmails(data:RunInvitation,send:typeof fetch=fetch):Promise<string[]>{
  const url='https://naol.lokwensio.com/shared-runs/'+data.token;
  const emails=[...data.emails].sort();
  if(!emails.length)return [];
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(emails.join('\n')));
  const emailHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  try{
    const response=await send('https://api.resend.com/emails/batch',{method:'POST',redirect:'manual',
      headers:{Authorization:'Bearer '+data.key,'Content-Type':'application/json','Idempotency-Key':'naol-run-'+data.token+'-'+data.revision+'-'+emailHash},
      body:JSON.stringify(emails.map(email=>({from:data.from,to:[email],subject:'[NAOL] '+data.inviter+' shared a dungeon run with you',
        text:data.inviter+' shared '+data.dungeon+' from '+data.playground+' with you on NAOL.\n\nView the run, party members, loot, sold quantities and current vending prices:\n'+url+'\n\nSign in or create an account using '+email+', then verify your email address to view this private run. The link has no expiry; access depends on its current sharing settings.\n\nIf you were not expecting this message, you can ignore it.'}))),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Run invitation delivery failed',response.status);return emails;}
    const result=await response.json() as {data?:Array<{id?:string}>};
    return emails.filter((_,index)=>!result.data?.[index]?.id);
  }catch{console.error('Run invitation delivery could not be confirmed');return emails;}
}
