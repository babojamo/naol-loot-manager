import { checkMutation, api, identity, json, guildCookie, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();
  const {guildId}=await request.json() as {guildId?:string};
  if(typeof guildId!=='string'||!/^[a-f0-9-]{36}$/i.test(guildId))throw new ApiError(400,'Choose a guild.');
  await database('guild_context',user,guildId);
  return json({ok:true},200,{'set-cookie':guildCookie(guildId,request,user.userId)});
},request);}
