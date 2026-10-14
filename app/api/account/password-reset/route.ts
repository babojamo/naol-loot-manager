import {assertNotImpersonating} from '../../../../lib/impersonation-server';
import {z} from 'zod';
import {cookies} from 'next/headers';
import {serverAuth} from '../../../../lib/account-auth';
import {api,checkMutation,json,ApiError,tokenHash} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import {recoverySession} from '../../../../lib/password-recovery-server';
import {recoveryCookie} from '../../../../lib/password-recovery';
async function body(request:Request){const text=await request.text();if(text.length>1024)throw new ApiError(400,'The request is too long.');try{return JSON.parse(text);}catch{throw new ApiError(400,'Check your details.');}}
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);await assertNotImpersonating();const parsed=z.object({email:z.string().trim().toLowerCase().email().max(254)}).strict().safeParse(await body(request));
  if(!parsed.success)throw new ApiError(400,'Enter a valid email address.');
  const bucket=await tokenHash('password-reset:'+(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown'));
  await database('contact_gate',undefined,undefined,{bucket});
  const client=await serverAuth();const {error}=await client.auth.resetPasswordForEmail(parsed.data.email,{redirectTo:new URL('/auth/callback',request.url).href});
  if(error)throw new ApiError(error.status===429?429:503,error.status===429?'Reset emails are temporarily limited. Please wait before trying again.':'Could not send the reset email right now. Please try again later.');
  return json({ok:true,message:'If an account uses this email address, a password reset link will arrive shortly. Check your inbox and spam folder, then open it in this browser.'});
},request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);await assertNotImpersonating();const parsed=z.object({password:z.string().min(8).max(128)}).strict().safeParse(await body(request));
  if(!parsed.success)throw new ApiError(400,'Choose a password of 8–128 characters.');
  const recovery=await recoverySession();if(!recovery)throw new ApiError(403,'This recovery session is missing or expired. Request a new password reset link.');
  await database('account',recovery.user);await database('account_change_gate',recovery.user);
  const {error}=await recovery.client.auth.updateUser({password:parsed.data.password});
  if(error)throw new ApiError(400,error.code==='same_password'?'Choose a password different from the previous password.':'Could not save the new password. Check its requirements and try again.');
  (await cookies()).set(recoveryCookie,'',{path:'/',httpOnly:true,sameSite:'lax',maxAge:0,secure:new URL(request.url).protocol==='https:'});
  await recovery.client.auth.signOut({scope:'global'});
  return json({ok:true});
},request);}
