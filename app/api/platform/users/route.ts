import {z} from 'zod';
import {api,identity,checkMutation,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function GET(request:Request){return api(async()=>{
  const params=new URL(request.url).searchParams;
  const parsed=z.object({page:z.coerce.number().int().min(1).max(1000000),query:z.string().max(200)}).safeParse({page:params.get('page')??1,query:params.get('query')??''});
  if(!parsed.success)throw new ApiError(400,'Choose a valid account page or search.');
  return json(await database('platform_users_page',await identity(),undefined,parsed.data));
},request);}
export async function DELETE(request:Request){return api(async()=>{
  checkMutation(request);
  const user=await identity();
  const parsed=z.object({userId:z.string().uuid(),confirmation:z.string().min(3).max(30)}).strict().safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Type the account username to confirm deletion.');
  return json(await database('platform_delete_schedule',user,undefined,parsed.data));
},request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();const cap=z.number().int().min(0).max(1000000).nullable().optional();
  const parsed=z.object({userId:z.string().uuid(),plan:z.enum(['Free','Elite','Legend']),banned:z.boolean(),discordOverride:z.boolean().optional(),assignPlan:z.boolean().default(false),paused:z.boolean().default(false),pausedUntil:z.string().datetime().nullable().default(null),overrides:z.object({playgrounds:cap,runs:cap,managers:cap}).strict()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Check the account plan and limits.');
  await database('platform_update',user,undefined,parsed.data);return json({ok:true});
},request);}

export async function POST(request:Request){return api(async()=>{checkMutation(request);const user=await identity();const parsed=z.object({action:z.literal('restore'),userId:z.string().uuid()}).strict().safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Choose an account to restore.');return json(await database('platform_restore_account',user,undefined,parsed.data));},request);}
