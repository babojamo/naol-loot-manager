import {api, guildContext, json, ApiError} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';

export async function GET(request:Request) {
  return api(async()=>{
    const {user,guild}=await guildContext(request);
    return json({names:await database<string[]>('loot_catalog',user,guild.id)});
  },request);
}
export async function POST(request:Request) {
  return api(async()=>{
    const {user,guild}=await guildContext(request);
    const body=await request.json() as {names?:unknown};
    if(!Array.isArray(body.names) || body.names.length>100 || body.names.some(name=>typeof name!=='string' || name.length>200)) throw new ApiError(400,'Choose at most 100 valid loot names.');
    return json({images:await database<Record<string,string>>('loot_catalog',user,guild.id,{names:body.names})});
  },request);
}
