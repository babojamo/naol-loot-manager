import {database} from './supabase-store';
import type {AccountUser} from './account-auth';
export async function flushDiscord(user:AccountUser,playgroundId:string){
  let delivered=0;
  // Persisted jobs survive a failed Discord request. A lease prevents concurrent sends.
  for(let i=0;i<8;i++){
    const job=await database<{id:string;claim:string;content:string;url:string}|null>('discord_claim',user,playgroundId);
    if(!job)return {delivered,pending:false};
    let success=false;
    try{
      if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(job.url))throw new Error('Invalid webhook');
      const r=await fetch(job.url,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({content:job.content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(5000)});
      success=r.ok;
    }catch{/* Never log webhook URLs or tokens. */}
    await database('discord_ack',user,playgroundId,{id:job.id,claim:job.claim,success});
    if(!success)return {delivered,pending:true};delivered++;
  }
  return {delivered,pending:true};
}
