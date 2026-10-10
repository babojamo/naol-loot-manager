import { env } from 'cloudflare:workers';
import { ApiError } from './tenant';
import type { AccountUser } from './account-auth';

type Operation='platform_users_page'|'platform_delete_check'|'party_read_claim'|'party_read_finish'|'public_shop'|'registration_gate'|'email_verify'|'account'|'guild_list'|'guild_create'|'guild_context'|'ledger_get'|'ledger_save'|'settings_get'|'settings_update'|'invite_create'|'invite_accept'|'invite_revoke'|'team_remove'|'public_list'|'public_guild'|'public_ledger'|'code_join'|'code_rotate'|'join_approve'|'join_reject'|'playground_delete'|'team_role'|'platform_users'|'platform_update'|'discord_config'|'discord_claim'|'discord_ack';
export async function database<T=Record<string,unknown>>(operation:Operation,user?:AccountUser,guildId?:string,data:unknown={}):Promise<T>{
  const url=env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !secret) throw new ApiError(503,'Supabase setup is incomplete. Configure the server key in the site environment.');
  const target=new URL('/rest/v1/rpc/loot_manager_operation',url);
  if(target.protocol!=='https:') throw new ApiError(503,'Supabase requires a secure project URL.');
  let response:Response;
  try {
    response=await fetch(target,{method:'POST',headers:{apikey:secret,...(secret.startsWith('eyJ')?{authorization:`Bearer ${secret}`}:{}) ,'content-type':'application/json'},body:JSON.stringify({p_operation:operation,p_actor:user?{id:user.userId,email:user.email,name:user.displayName}:null,p_guild_id:guildId??null,p_data:data}),signal:AbortSignal.timeout(15000)});
  } catch {throw new ApiError(503,'The playground database is temporarily unavailable. Please try again.');}
  if(!response.ok) {
    if(response.status===404) throw new ApiError(503,'Run the NAOL SQL migration in the new Supabase project.');
    if(response.status===401 || response.status===403) throw new ApiError(503,'Supabase server access is not configured correctly. Check the server key and migration.');
    const detail=await response.json().catch(()=>({})) as {code?:string};
    console.error('Supabase operation failed',operation,response.status,detail.code??'unknown');
    throw new ApiError(503,'The playground database is temporarily unavailable. Please try again.');
  }
  const result=await response.json() as T & {_error?:{status:number;message:string}};
  if(result?._error) throw new ApiError(result._error.status,result._error.message);
  return result;
}
