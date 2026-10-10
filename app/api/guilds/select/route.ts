import { checkMutation, api, db, identity, json, guildCookie, ApiError } from "../../../../lib/tenant";
export async function POST(request: Request) { return api(async () => {
  checkMutation(request);
  const user = await identity();
  const { guildId } = await request.json() as { guildId?: string };
  if (typeof guildId !== 'string') throw new ApiError(400,'Choose a guild.');
  const access = await db().prepare('SELECT guild_id FROM guild_users WHERE guild_id=? AND user_id=?').bind(guildId,user.userId).first();
  if (!access) throw new ApiError(403,'You do not have access to this guild.');
  return json({ ok: true },200,{ 'set-cookie': guildCookie(guildId,request) });
},request); }
