import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { defaultState } from "./default-state";
import type { LootState } from "./types";

export type Guild = { id: string; name: string; slug: string; description: string; is_public: number; role?: string };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function db() { if (!env.DB) throw new ApiError(503, "The guild database is unavailable."); return env.DB; }
export async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Sign in to continue.");
  await db().prepare("INSERT INTO accounts (id,email,name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name")
    .bind(user.userId, user.email.toLowerCase(), user.displayName, new Date().toISOString()).run();
  return user;
}
export async function guildContext(request: Request) {
  checkMutation(request);
  const user = await identity();
  const guildId = request.headers.get("cookie")?.match(/(?:^|;\s*)loot_manager_guild=([^;]+)/)?.[1];
  if (!guildId) throw new ApiError(409, "Choose a guild to continue.");
  const guild = await db().prepare("SELECT g.*,m.role FROM guilds g JOIN guild_users m ON m.guild_id=g.id WHERE g.id=? AND m.user_id=?")
    .bind(guildId, user.userId).first<Guild>();
  if (!guild) throw new ApiError(403, "You do not have access to this guild.");
  if (request.headers.get('X-Guild-ID') && request.headers.get('X-Guild-ID') !== guild.id) throw new ApiError(409,'Your active guild changed. Reload this page before continuing.');
  return { user, guild };
}
export function requireAdmin(guild: Guild) {
  if (!['owner','admin'].includes(guild.role ?? '')) throw new ApiError(403, "Only guild owners and admins can manage the team.");
}
export function checkMutation(request: Request) {
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403,'Use this website to make changes.');
}
export function guildCookie(id: string, request: Request) {
  return `loot_manager_guild=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
export async function api(work: () => Promise<Response>, request?: Request) {
  try { return await work(); } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("Guild request failed", e instanceof Error ? e.message : "Unknown error");
    return json({ error: "Something went wrong. Please try again." }, 500);
  } finally {
    if(request?.body && !request.bodyUsed) { try { await request.arrayBuffer(); } catch {} }
  }
}
export async function ledger(guildId: string) {
  const row = await db().prepare("SELECT payload,version FROM guild_ledgers WHERE guild_id=?").bind(guildId).first<{ payload: string; version: number }>();
  return { state: row ? JSON.parse(row.payload) as LootState : structuredClone(defaultState), version: row?.version ?? 0 };
}
export async function publicGuild(request: Request) {
  const slug = new URL(request.url).searchParams.get('guild') ?? '';
  if (!slug) throw new ApiError(400, "Choose a guild first.");
  const guild = await db().prepare("SELECT id,name,slug,description,is_public FROM guilds WHERE slug=? AND is_public=1").bind(slug).first<Guild>();
  if (!guild) throw new ApiError(404, "This guild has not published its shop and inquiries.");
  return guild;
}
export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2,'0')).join('');
}
