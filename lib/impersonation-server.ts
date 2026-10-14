import {cookies} from 'next/headers';
import {serverAuth,type AccountUser} from './account-auth';
import {database} from './supabase-store';
import {ApiError} from './tenant';
import {impersonationCookie,impersonationHash,parseImpersonation,verifiedAuthSessionHash} from './impersonation';
export type ImpersonationRecord={id:string;expiresAt:string;user:AccountUser;target:{username:string;name:string}};
export async function realAccountSession(){
  const client=await serverAuth();const {data:{session}}=await client.auth.getSession();if(!session)return null;
  const {data:{user},error}=await client.auth.getUser(session.access_token);if(error||!user?.email)return null;
  const sessionHash=await verifiedAuthSessionHash(session.access_token,user.id);
  const accountUser:AccountUser={userId:user.id,email:user.email,displayName:user.user_metadata?.name||user.email,fullName:user.user_metadata?.name??null};
  return {user:accountUser,sessionHash};
}
export async function resolveImpersonation(value:string){
  const parsed=parseImpersonation(value),real=await realAccountSession();if(!parsed||!real?.sessionHash)throw new ApiError(403,'Exit impersonation and sign in again.');
  const record=await database<ImpersonationRecord>('platform_impersonation_resolve',real.user,undefined,{tokenHash:await impersonationHash(parsed.token),sessionHash:real.sessionHash});
  if(record.id!==parsed.id)throw new ApiError(403,'Exit impersonation and sign in again.');
  return {record,user:{...record.user,impersonatorId:real.user.userId,impersonationId:record.id,impersonationSessionHash:real.sessionHash} as AccountUser};
}
export async function assertNotImpersonating(){
  if((await cookies()).get(impersonationCookie)?.value)throw new ApiError(403,'Account changes and password recovery are unavailable while impersonating. Exit impersonation first.');
}
export async function endImpersonation(request:Request){
  const store=await cookies(),parsed=parseImpersonation(store.get(impersonationCookie)?.value);
  const real=await realAccountSession();
  try{if(parsed&&real?.sessionHash)await database('platform_impersonation_end',real.user,undefined,{tokenHash:await impersonationHash(parsed.token),sessionHash:real.sessionHash});}
  finally{store.set(impersonationCookie,'',{path:'/',httpOnly:true,sameSite:'lax',secure:new URL(request.url).protocol==='https:',maxAge:0});}
  return real?'/admin':'/login';
}
