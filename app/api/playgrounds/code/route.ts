import {z} from 'zod';
import {api,identity,checkMutation,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();const parsed=z.object({code:z.string().trim().regex(/^[a-f0-9]{32}$/i)}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Enter the playground code provided by its owner.');
  return json(await database('code_join',user,undefined,{code:parsed.data.code.toLowerCase()}));
},request);}
