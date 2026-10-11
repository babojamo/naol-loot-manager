import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {api,ApiError,guildContext,json,tokenHash} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';
import {sendRunShareEmails} from '../../../lib/run-share-email';
import type {LootState} from '../../../lib/types';
export type RunShare={token:string;mode:'public'|'restricted'|'disabled';emails:string[];revision:number};
type ShareResult={share:RunShare|null;notifyEmails?:string[]};
const runIdSchema=z.string().min(1).max(120);
export async function GET(request:Request){return api(async()=>{
  const {user,guild}=await guildContext(request);
  const runId=runIdSchema.safeParse(new URL(request.url).searchParams.get('runId'));
  if(!runId.success)throw new ApiError(400,'Choose a dungeon run.');
  return json(await database<ShareResult>('run_share_get',user,guild.id,{runId:runId.data}));
},request);}
export async function POST(request:Request){return api(async()=>{
  const {user,guild}=await guildContext(request);
  const text=await request.text();if(text.length>8192)throw new ApiError(400,'Sharing details are too long.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Check the sharing details.');}
  const parsed=z.object({runId:runIdSchema,mode:z.enum(['public','restricted','disabled']),emails:z.array(z.string().trim().email().max(200)).max(20),revision:z.number().int().min(0)}).safeParse(body);
  if(!parsed.success)throw new ApiError(400,'Choose sharing access and enter up to 20 valid email addresses.');
  const data=parsed.data;data.emails=[...new Set(data.emails.map(e=>e.toLowerCase()))];
  if(data.mode==='restricted'&&!data.emails.length)throw new ApiError(400,'Enter at least one recipient email address.');
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const {state}=await database<{state:LootState}>('ledger_get',user,guild.id);
  const dungeon=state.runs.find(r=>r.id===data.runId)?.dungeon??'Dungeon run';
  const result=await database<ShareResult>('run_share_save',user,guild.id,{...data,token,tokenHash:await tokenHash(token)});
  const recipients=result.notifyEmails??[];let failedEmails:string[]=[];
  if(recipients.length&&result.share){
    // Await delivery so serverless shutdown cannot discard pending emails.
    failedEmails=env.RESEND_API_KEY&&env.CONTACT_FROM_EMAIL?await sendRunShareEmails({key:env.RESEND_API_KEY,from:env.CONTACT_FROM_EMAIL,emails:recipients,playground:guild.name,dungeon,inviter:user.displayName,token:result.share.token,revision:result.share.revision}):recipients;
  }
  return json({share:result.share,emailed:recipients.length-failedEmails.length,failedEmails});
},request);}
