import {cookies} from 'next/headers';
import {z} from 'zod';
import {api,ApiError,json,checkMutation} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import {endImpersonation,realAccountSession,resolveImpersonation,type ImpersonationRecord} from '../../../../lib/impersonation-server';
import {impersonationCookie,impersonationHash,impersonationSeconds,newImpersonationToken} from '../../../../lib/impersonation';
function sameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'Use this website to change impersonation.');}
export async function GET(request:Request){return api(async()=>{
  const value=(await cookies()).get(impersonationCookie)?.value;if(!value)return json({active:false});
  try{const {record}=await resolveImpersonation(value);return json({active:true,target:record.target,expiresAt:record.expiresAt});}
  catch(e){if(e instanceof ApiError&&[401,403,404].includes(e.status))return json({active:false,needsExit:true});throw e;}
},request);}
export async function POST(request:Request){return api(async()=>{
  sameOrigin(request);checkMutation(request);
  if((await cookies()).get(impersonationCookie)?.value)throw new ApiError(409,'Exit the current impersonation before starting another.');
  const real=await realAccountSession();if(!real?.sessionHash)throw new ApiError(401,'Sign in again before impersonating an account.');
  const text=await request.text();if(text.length>512)throw new ApiError(400,'Choose a valid account.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Choose a valid account.');}
  const parsed=z.object({userId:z.string().uuid()}).strict().safeParse(body);if(!parsed.success)throw new ApiError(400,'Choose a valid account.');
  const token=newImpersonationToken();
  const record=await database<ImpersonationRecord>('platform_impersonation_start',real.user,undefined,{userId:parsed.data.userId,tokenHash:await impersonationHash(token),sessionHash:real.sessionHash});
  (await cookies()).set(impersonationCookie,`${record.id}.${token}`,{path:'/',httpOnly:true,sameSite:'lax',secure:new URL(request.url).protocol==='https:',maxAge:impersonationSeconds});
  return json({ok:true,next:'/playgrounds'});
},request);}
export async function DELETE(request:Request){return api(async()=>{sameOrigin(request);return json({ok:true,next:await endImpersonation(request)});},request);}
