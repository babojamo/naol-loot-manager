import {database} from './supabase-store';
import type {AccountUser} from './account-auth';
import {deliverDiscord} from './discord-delivery';
export type DiscordStatus={pending:boolean;pendingCount:number;error:string|null;retryAt:string|null};
export async function flushDiscord(user:AccountUser,playgroundId:string){
  let delivered=0;
  // Persisted jobs survive a failed Discord request. A lease prevents concurrent sends.
  for(let i=0;i<8;i++){
    const job=await database<{id:string;claim:string;content:string;url:string}|null>('discord_claim',user,playgroundId);
    if(!job)return {delivered,...await database<DiscordStatus>('discord_status',user,playgroundId)};
    const status=await deliverDiscord(job.url,job.content);
    await database('discord_ack',user,playgroundId,{id:job.id,claim:job.claim,...status});
    if(!status.success){console.warn('Discord delivery deferred',status.error);return {delivered,...await database<DiscordStatus>('discord_status',user,playgroundId)};}delivered++;
  }
  return {delivered,...await database<DiscordStatus>('discord_status',user,playgroundId)};
}
