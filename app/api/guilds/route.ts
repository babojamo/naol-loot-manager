import { z } from "zod";
import { checkMutation, api, db, identity, json, guildCookie, ApiError } from "../../../lib/tenant";
import { defaultState } from "../../../lib/default-state";
const createSchema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48), description: z.string().trim().max(300).default(''), isPublic: z.boolean().default(false) });
export async function GET(request: Request) { return api(async () => {
  const user = await identity();
  const { results } = await db().prepare("SELECT g.*,m.role FROM guilds g JOIN guild_users m ON m.guild_id=g.id WHERE m.user_id=? ORDER BY g.name").bind(user.userId).all();
  return json({ guilds: results, user: { name: user.displayName, email: user.email } });
},request); }
export async function POST(request: Request) { return api(async () => {
  checkMutation(request);
  const user = await identity();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) throw new ApiError(400, "Use a guild name and a URL slug with lowercase letters, numbers and hyphens.");
  const count = await db().prepare("SELECT COUNT(*) AS total FROM guild_users WHERE user_id=? AND role='owner'").bind(user.userId).first<{total:number}>();
  if ((count?.total ?? 0) >= 20) throw new ApiError(400, "You can own up to 20 guilds.");
  const data = parsed.data, id = crypto.randomUUID(), now = new Date().toISOString();
  const exists = await db().prepare("SELECT id FROM guilds WHERE slug=?").bind(data.slug).first();
  if (exists) throw new ApiError(409, "That guild URL is already taken.");
  await db().batch([
    db().prepare("INSERT INTO guilds (id,name,slug,description,is_public,created_at) VALUES (?,?,?,?,?,?)").bind(id,data.name,data.slug,data.description,data.isPublic ? 1 : 0,now),
    db().prepare("INSERT INTO guild_users (guild_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").bind(id,user.userId,now),
    db().prepare("INSERT INTO guild_ledgers (guild_id,payload,version,updated_at) VALUES (?,?,0,?)").bind(id,JSON.stringify(defaultState),now),
  ]);
  return json({ id },201,{ 'set-cookie': guildCookie(id,request) });
},request); }
