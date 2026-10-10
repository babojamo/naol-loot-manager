import { checkMutation, api, identity, tokenHash, json, guildCookie, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
export async function POST(request:Request){return api(async()=>{
  checkMutation(request);const user=await identity();
  const {token}=await request.json() as {token?:string};
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(400,'This invitation is invalid.');
  const result=await database<{guildId:string}>('invite_accept',user,undefined,{tokenHash:await tokenHash(token)});
  return json({ok:true},200,{'set-cookie':guildCookie(result.guildId,request)});
},request);}
