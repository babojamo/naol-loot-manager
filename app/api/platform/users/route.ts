import {z} from 'zod';
import {api,identity,checkMutation,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function GET(request:Request){return api(async()=>json({users:await database('platform_users',await identity())}),request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();const cap=z.number().int().min(0).max(1000000).nullable().optional();
  const parsed=z.object({userId:z.string().uuid(),plan:z.enum(['Free','Elite','Legend']),banned:z.boolean(),paused:z.boolean().default(false),pausedUntil:z.string().datetime().nullable().default(null),overrides:z.object({playgrounds:cap,runs:cap,managers:cap}).strict()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Check the account plan and limits.');
  await database('platform_update',user,undefined,parsed.data);return json({ok:true});
},request);}
