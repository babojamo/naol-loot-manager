import {z} from 'zod';
import {api,checkMutation,identity,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function GET(request:Request){return api(async()=>{
  const userId=new URL(request.url).searchParams.get('userId');
  if(!z.string().uuid().safeParse(userId).success)throw new ApiError(400,'Choose a valid account.');
  return json(await database('platform_supporter_get',await identity(),undefined,{userId}));
},request);}
export async function PUT(request:Request){return api(async()=>{
  checkMutation(request);
  const user=await identity();
  const parsed=z.object({userId:z.string().uuid(),guildId:z.string().uuid().nullable(),published:z.boolean(),featured:z.boolean().default(false),featuredOrder:z.number().int().min(0).max(999).default(0),badge:z.enum(['Supporter','Elite Supporter','Legend Supporter'])}).strict().safeParse(await request.json());
  if(!parsed.success||parsed.data.published&&!parsed.data.guildId)throw new ApiError(400,'Select an owned playground before publishing.');
  return json(await database('platform_supporter_save',user,undefined,parsed.data));
},request);}
