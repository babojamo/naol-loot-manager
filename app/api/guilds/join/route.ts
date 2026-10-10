import { checkMutation, api, db, identity, tokenHash, json, guildCookie, ApiError } from '../../../../lib/tenant';
export async function POST(request: Request) { return api(async () => {
  checkMutation(request);
  const user=await identity();
  const {token}=await request.json() as {token?:string};
  if(!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(400,'This invitation is invalid.');
  const hash=await tokenHash(token),now=new Date().toISOString();
  const invite=await db().prepare('SELECT id,guild_id,role FROM guild_invites WHERE token_hash=? AND email=? AND used_by IS NULL AND expires_at>?')
    .bind(hash,user.email.toLowerCase(),now).first<{id:string;guild_id:string;role:string}>();
  if(!invite) throw new ApiError(403,'This invite has expired, was already used, or belongs to another email address.');
  await db().batch([
    db().prepare('UPDATE guild_invites SET used_by=? WHERE id=? AND used_by IS NULL AND expires_at>?').bind(user.userId,invite.id,now),
    db().prepare('INSERT INTO guild_users (guild_id,user_id,role,joined_at) SELECT guild_id,?,role,? FROM guild_invites WHERE id=? AND used_by=? ON CONFLICT(guild_id,user_id) DO NOTHING').bind(user.userId,now,invite.id,user.userId),
  ]);
  const joined=await db().prepare('SELECT role FROM guild_users WHERE guild_id=? AND user_id=?').bind(invite.guild_id,user.userId).first();
  if(!joined) throw new ApiError(409,'The invitation could not be accepted.');
  return json({ok:true},200,{'set-cookie':guildCookie(invite.guild_id,request)});
},request); }
