import {z} from 'zod';
import {api,identity,checkMutation,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import {createClient} from '@supabase/supabase-js';
import {env} from 'cloudflare:workers';
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
  const target=await database<{authUserId:string}>('platform_delete_check',user,undefined,parsed.data);
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!env.NEXT_PUBLIC_SUPABASE_URL||!secret)throw new ApiError(503,'Supabase server access is not configured.');
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  // Migration 009's trigger atomically removes owned playgrounds and app data.
  const {error}=await client.auth.admin.deleteUser(target.authUserId,false);
  if(error){console.error('Account deletion failed',error.status);throw new ApiError(503,'Could not confirm account deletion. Refresh the account list before trying again.');}
  return json({ok:true});
},request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();const cap=z.number().int().min(0).max(1000000).nullable().optional();
  const parsed=z.object({userId:z.string().uuid(),plan:z.enum(['Free','Elite','Legend']),banned:z.boolean(),discordOverride:z.boolean().optional(),assignPlan:z.boolean().default(false),paused:z.boolean().default(false),pausedUntil:z.string().datetime().nullable().default(null),overrides:z.object({playgrounds:cap,runs:cap,managers:cap}).strict()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Check the account plan and limits.');
  await database('platform_update',user,undefined,parsed.data);return json({ok:true});
},request);}
