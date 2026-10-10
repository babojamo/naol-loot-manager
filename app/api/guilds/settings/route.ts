import { z } from 'zod';
import { api, guildContext, json, requireAdmin, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
export async function GET(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);
  return json(await database('settings_get',user,guild.id));
},request);}
export async function PUT(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(300),isPublic:z.boolean()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Check the guild name and description.');
  await database('settings_update',user,guild.id,parsed.data);
  return json({ok:true});
},request);}
export async function DELETE(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const {userId,inviteId}=await request.json() as {userId?:string;inviteId?:string};
  if(inviteId){if(!/^[a-f0-9-]{36}$/i.test(inviteId))throw new ApiError(400,'Choose an invitation.');await database('invite_revoke',user,guild.id,{inviteId});}
  else{if(!userId)throw new ApiError(400,'Choose a team member.');await database('team_remove',user,guild.id,{userId});}
  return json({ok:true});
},request);}
