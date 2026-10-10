import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getAccountUser} from '../../../lib/account-auth';
import {api,checkMutation,json,ApiError,tokenHash} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';
import {sendContactEmail} from '../../../lib/contact-delivery';
const schema=z.object({email:z.string().trim().email().max(254),subject:z.string().trim().min(2).max(160).refine(s=>!/[\r\n]/.test(s)),message:z.string().trim().min(10).max(5000),requestId:z.string().uuid(),website:z.string().max(200).default('')}).strict();
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);
  const text=await request.text();if(text.length>12000)throw new ApiError(400,'Your message is too long.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Check your message details.');}
  const parsed=schema.safeParse(body);if(!parsed.success||parsed.data.website)throw new ApiError(400,'Enter a valid email, subject and message.');
  if(!env.RESEND_API_KEY||!env.CONTACT_FROM_EMAIL)throw new ApiError(503,'Contact email is temporarily unavailable. Please try again later.');
  const user=await getAccountUser();if(user)await database('account',user);
  await database('contact_gate',undefined,undefined,{bucket:await tokenHash(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown')});
  const {email,subject,message,requestId}=parsed.data;
  const result=await sendContactEmail({key:env.RESEND_API_KEY,from:env.CONTACT_FROM_EMAIL,email,subject,message,requestId,account:user?.email});
  if(!result)throw new ApiError(503,'Could not send your message. Please try again later.');
  return json({ok:true});
},request);}
