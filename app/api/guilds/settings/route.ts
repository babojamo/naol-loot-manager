import { z } from 'zod';
import { api, guildContext, json, requireAdmin, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
export async function GET(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);
  return json(await database('settings_get',user,guild.id));
},request);}
export async function PUT(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(300),shopEnabled:z.boolean(),inquiriesEnabled:z.boolean(),vendorContactMessage:z.string().trim().max(2000).optional()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Check the playground name, description and vendor contact message.');
  await database('settings_update',user,guild.id,parsed.data);
  return json({ok:true});
},request);}
export async function POST(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.discriminatedUnion('action',[
    z.object({action:z.literal('code_rotate')}),
    z.object({action:z.literal('join_approve'),userId:z.string().uuid()}),
    z.object({action:z.literal('join_reject'),userId:z.string().uuid()}),
    z.object({action:z.literal('team_role'),userId:z.string().uuid(),role:z.literal('manager')}),
    z.object({action:z.literal('playground_delete'),confirmation:z.string().min(2).max(80)}),
  ]).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Choose a valid playground action.');
  await database(parsed.data.action,user,guild.id,parsed.data);return json({ok:true});
},request);}
export async function DELETE(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const {userId,inviteId}=await request.json() as {userId?:string;inviteId?:string};
  if(inviteId){if(!/^[a-f0-9-]{36}$/i.test(inviteId))throw new ApiError(400,'Choose an invitation.');await database('invite_revoke',user,guild.id,{inviteId});}
  else{if(!userId)throw new ApiError(400,'Choose a team member.');await database('team_remove',user,guild.id,{userId});}
  return json({ok:true});
},request);}
