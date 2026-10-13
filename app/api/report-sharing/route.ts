import {api,ApiError,guildContext,json,tokenHash} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';
import {reportFilterSchema,reportTypeSchema,type ReportShare} from '../../../lib/report-sharing';
import {z} from 'zod';
export async function GET(request:Request){return api(async()=>{const {user,guild}=await guildContext(request);return json({shares:await database<ReportShare[]>('report_share_list',user,guild.id)});},request);}
export async function POST(request:Request){return api(async()=>{
  const {user,guild}=await guildContext(request);const text=await request.text();if(text.length>4096)throw new ApiError(400,'Report filters are too long.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Choose a report and valid filters.');}
  const data=z.object({type:reportTypeSchema,filters:reportFilterSchema}).safeParse(body);
  if(!data.success)throw new ApiError(400,data.error.issues[0]?.message??'Choose a report and valid filters.');
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const share=await database<ReportShare>('report_share_create',user,guild.id,{...data.data,id:crypto.randomUUID(),token,tokenHash:await tokenHash(token)});
  return json({share});
},request);}
export async function DELETE(request:Request){return api(async()=>{const {user,guild}=await guildContext(request);const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('id'));if(!id.success)throw new ApiError(400,'Choose a report link.');return json(await database('report_share_revoke',user,guild.id,{id:id.data}));},request);}
