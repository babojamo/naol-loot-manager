import { z } from 'zod';
import { api, db, guildContext, requireAdmin, tokenHash, json, ApiError } from '../../../../lib/tenant';
export async function POST(request: Request) { return api(async () => {
  const {guild,user}=await guildContext(request); requireAdmin(guild);
  const parsed=z.object({email:z.string().trim().email().max(200),role:z.enum(['manager','admin'])}).safeParse(await request.json());
  if(!parsed.success) throw new ApiError(400,'Enter a valid email and role.');
  if(parsed.data.role==='admin' && guild.role!=='owner') throw new ApiError(403,'Only the owner can invite admins.');
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  const now=new Date(),expires=new Date(now.getTime()+7*86400000).toISOString();
  await db().prepare('INSERT INTO guild_invites (id,guild_id,email,role,token_hash,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),guild.id,parsed.data.email.toLowerCase(),parsed.data.role,await tokenHash(token),user.userId,expires,now.toISOString()).run();
  return json({joinPath:`/join?token=${token}`,expiresAt:expires},201);
},request); }
