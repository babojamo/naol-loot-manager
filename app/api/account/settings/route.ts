import {assertNotImpersonating} from '../../../../lib/impersonation-server';
import {z} from 'zod';
import {cookies} from 'next/headers';
import {serverAuth} from '../../../../lib/account-auth';
import {api,checkMutation,identity,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import type {AccountUser} from '../../../../lib/account-auth';
const password=z.string().min(8).max(128);
const updates=z.discriminatedUnion('action',[
  z.object({action:z.literal('profile'),name:z.string().trim().min(2).max(80),username:z.string().trim().toLowerCase().min(3).max(30)}).strict(),
  z.object({action:z.literal('email'),email:z.string().trim().toLowerCase().email().max(254),currentPassword:password}).strict(),
  z.object({action:z.literal('password'),password,currentPassword:password}).strict(),
]);
async function readBody(request:Request){const body=await request.text();if(body.length>4096)throw new ApiError(400,'Account details are too long.');try{return JSON.parse(body);}catch{throw new ApiError(400,'Check the account details.');}}
async function confirmPassword(user:AccountUser,value:string){
  const client=await serverAuth();
  const {data,error}=await client.auth.signInWithPassword({email:user.email,password:value});
  if(error||data.user?.id!==user.userId)throw new ApiError(400,'Your current password could not be confirmed.');
  return client;
}
export async function GET(request:Request){return api(async()=>{
  const user=await identity();const a=await database<{name:string;username:string;email:string;email_verified:boolean;plan:string}>('account',user);
  return json({name:a.name,username:a.username,email:a.email,email_verified:a.email_verified,plan:a.plan,impersonating:!!user.impersonationId});
},request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);await assertNotImpersonating();const user=await identity();
  const parsed=updates.safeParse(await readBody(request));if(!parsed.success)throw new ApiError(400,'Check the name, username, email and password requirements.');
  const d=parsed.data;await database('account_change_gate',user);
  if(d.action==='profile'){
    await database('account_profile_check',user,undefined,{username:d.username});
    const client=await serverAuth();const {error}=await client.auth.updateUser({data:{name:d.name,username:d.username}});
    if(error)throw new ApiError(400,'Could not update your profile. That username may already be taken.');
    return json({ok:true,message:'Account information saved.'});
  }
  const client=await confirmPassword(user,d.currentPassword);
  if(d.action==='password'){
    const {error}=await client.auth.updateUser({password:d.password});
    if(error)throw new ApiError(400,error.code==='same_password'?'Choose a password different from your current password.':'Could not change your password. Check the password requirements and try again.');
    return json({ok:true,message:'Password changed. Use your new password next time you sign in.'});
  }
  if(d.email===user.email.toLowerCase())throw new ApiError(400,'Enter a different email address.');
  (await cookies()).set('naol_verification_next',encodeURIComponent('/account'),{path:'/auth/callback',httpOnly:true,sameSite:'lax',maxAge:604800,secure:new URL(request.url).protocol==='https:'});
  const {error}=await client.auth.updateUser({email:d.email},{emailRedirectTo:new URL('/auth/callback',request.url).href});
  if(error)throw new ApiError(400,'Could not request the email change. The address may already be registered, or email delivery is temporarily limited.');
  return json({ok:true,message:'Email change requested. Check the confirmation messages sent to your email addresses and follow their links. Your new email is used after confirmation.'});
},request);}
export async function DELETE(request:Request){return api(async()=>{
  checkMutation(request);await assertNotImpersonating();const user=await identity();
  const parsed=z.object({confirmation:z.string().min(3).max(30),currentPassword:password}).strict().safeParse(await readBody(request));
  if(!parsed.success)throw new ApiError(400,'Enter your current password and exact username to confirm deletion.');
  await database('account_change_gate',user);const client=await confirmPassword(user,parsed.data.currentPassword);
  const result=await database('account_delete',user,undefined,{confirmation:parsed.data.confirmation});
  await client.auth.signOut({scope:'global'});
  return json(result);
},request);}
