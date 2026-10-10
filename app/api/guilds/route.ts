import { z } from 'zod';
import { checkMutation, api, identity, json, guildCookie, ApiError } from '../../../lib/tenant';
import { database } from '../../../lib/supabase-store';
import { defaultState } from '../../../lib/default-state';
const createSchema=z.object({name:z.string().trim().min(2).max(80),slug:z.string().regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48),description:z.string().trim().max(300).default(''),isPublic:z.boolean().default(false)});
export async function GET(request:Request){return api(async()=>{
  const user=await identity();
  return json(await database('guild_list',user));
},request);}
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();
  const parsed=createSchema.safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Use a guild name and a URL slug with lowercase letters, numbers and hyphens.');
  const result=await database<{id:string}>('guild_create',user,undefined,{...parsed.data,id:crypto.randomUUID(),state:defaultState});
  return json(result,201,{'set-cookie':guildCookie(result.id,request)});
},request);}
