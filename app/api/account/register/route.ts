import {assertNotImpersonating} from '../../../../lib/impersonation-server';
import {createClient} from '@supabase/supabase-js';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {api,checkMutation,json,ApiError,tokenHash} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
const schema=z.object({name:z.string().trim().min(2).max(80),username:z.string().trim().toLowerCase().min(3).max(30),email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(8).max(128)});
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);await assertNotImpersonating();
  const text=await request.text();if(text.length>4096)throw new ApiError(400,'Registration details are too long.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Check your registration details.');}
  const parsed=schema.safeParse(body);if(!parsed.success)throw new ApiError(400,'Enter a valid name, username, email and password.');
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret||!env.NEXT_PUBLIC_SUPABASE_URL)throw new ApiError(503,'Account registration is temporarily unavailable.');
  const bucket=await tokenHash(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown');
  await database('registration_gate',undefined,undefined,{bucket});
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const {name,username,email,password}=parsed.data;
  const {error}=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,username,email_verification_pending:true}});
  if(error){if(error.code==='email_exists')throw new ApiError(409,'This email is already registered. Sign in to continue.');throw new ApiError(400,/Database error/i.test(error.message)?'That username may be taken. Choose another username.':'Could not create the account. Check your details and try again.');}
  return json({ok:true},201);
},request);}
