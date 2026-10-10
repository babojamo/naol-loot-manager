import { z } from 'zod';
import { api, db, guildContext, json, requireAdmin, ApiError } from '../../../../lib/tenant';
export async function GET(request: Request) { return api(async () => {
  const { guild, user } = await guildContext(request);
  const { results: team } = await db().prepare('SELECT a.id,a.name,a.email,m.role,m.joined_at FROM guild_users m JOIN accounts a ON a.id=m.user_id WHERE m.guild_id=? ORDER BY m.joined_at').bind(guild.id).all();
  const { results: invites } = ['owner','admin'].includes(guild.role ?? '')
    ? await db().prepare('SELECT id,email,role,expires_at FROM guild_invites WHERE guild_id=? AND used_by IS NULL AND expires_at>? ORDER BY created_at DESC').bind(guild.id,new Date().toISOString()).all()
    : { results: [] };
  return json({ guild, team, invites, userId: user.userId });
},request); }
export async function PUT(request: Request) { return api(async () => {
  const { guild } = await guildContext(request); requireAdmin(guild);
  const parsed = z.object({ name:z.string().trim().min(2).max(80), description:z.string().trim().max(300), isPublic:z.boolean() }).safeParse(await request.json());
  if (!parsed.success) throw new ApiError(400,'Check the guild name and description.');
  const data=parsed.data;
  await db().prepare('UPDATE guilds SET name=?,description=?,is_public=? WHERE id=?').bind(data.name,data.description,data.isPublic?1:0,guild.id).run();
  return json({ok:true});
},request); }
export async function DELETE(request: Request) { return api(async () => {
  const { guild } = await guildContext(request); requireAdmin(guild);
  const {userId,inviteId} = await request.json() as {userId?:string;inviteId?:string};
  if(inviteId) {await db().prepare('DELETE FROM guild_invites WHERE id=? AND guild_id=? AND used_by IS NULL').bind(inviteId,guild.id).run();return json({ok:true});}
  if(!userId) throw new ApiError(400,'Choose a team member.');
  const target=await db().prepare('SELECT role FROM guild_users WHERE guild_id=? AND user_id=?').bind(guild.id,userId).first<{role:string}>();
  if(!target || target.role==='owner' || (target.role==='admin' && guild.role!=='owner')) throw new ApiError(403,'This team member cannot be removed by your account.');
  await db().prepare('DELETE FROM guild_users WHERE guild_id=? AND user_id=?').bind(guild.id,userId).run();
  return json({ok:true});
},request); }
