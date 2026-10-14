import {z} from 'zod';
import {api,ApiError,checkMutation,identity,json} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import {sendPlatformMail} from '../../../../lib/platform-mail-server';
export async function GET(request:Request){return api(async()=>{
  const user=await identity(),params=new URL(request.url).searchParams;
  if(params.has('id')){const id=z.string().uuid().safeParse(params.get('id'));if(!id.success)throw new ApiError(400,'Choose a mail record.');return json(await database('platform_mail_get',user,undefined,{id:id.data}));}
  if(params.has('recipient')){const id=z.string().uuid().safeParse(params.get('recipient'));if(!id.success)throw new ApiError(400,'Choose an account.');return json(await database('platform_mail_recipient',user,undefined,{userId:id.data}));}
  const page=z.coerce.number().int().min(1).max(1000000).safeParse(params.get('page')??1);if(!page.success)throw new ApiError(400,'Choose a valid page.');
  return json(await database('platform_mail_list',user,undefined,{page:page.data}));
},request);}
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();
  const text=await request.text();if(text.length>20000)throw new ApiError(400,'This message is too long.');
  let body:unknown;try{body=JSON.parse(text);}catch{throw new ApiError(400,'Check the message details.');}
  const parsed=z.discriminatedUnion('action',[
    z.object({action:z.literal('create'),requestId:z.string().uuid(),userIds:z.array(z.string().uuid()).min(1).max(100),subject:z.string().trim().min(2).max(160).refine(v=>!/[\r\n]/.test(v)),message:z.string().trim().min(2).max(5000)}).strict(),
    z.object({action:z.literal('retry'),id:z.string().uuid()}).strict(),
  ]).safeParse(body);
  if(!parsed.success)throw new ApiError(400,'Choose up to 100 accounts and enter a valid subject and message.');
  const d=parsed.data;
  const id=d.action==='create'?(await database<{id:string}>('platform_mail_create',user,undefined,{...d,userIds:[...new Set(d.userIds)]})).id:d.id;
  try{return json({job:await sendPlatformMail(id,user)});}catch(e){if(e instanceof ApiError&&e.status===503)return json({job:await database('platform_mail_get',user,undefined,{id}),warning:e.message});throw e;}
},request);}
