import {impersonationCookie,impersonationMutationContextMatches} from './impersonation';
import { getAccountUser } from "./account-auth";
import { database } from './supabase-store';
import type { AccountUser } from './account-auth';
import type { LootState } from "./types";

export type Guild = { icon?:string|null; id: string; name: string; slug: string; description: string; is_public: number; role?: string };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function identity() {
  const user = await getAccountUser();
  if (!user) throw new ApiError(401, "Sign in to continue.");
  await database('account',user);
  return user;
}
export async function guildContext(request: Request) {
  checkMutation(request);
  const user = await identity();
  const cookieName=`loot_manager_playground_${user.userId}`;
  const cookie=request.headers.get("cookie")??"";
  const guildId=cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(cookieName+"="))?.slice(cookieName.length+1)??cookie.match(/(?:^|;\s*)loot_manager_guild=([^;]+)/)?.[1];
  if (!guildId) throw new ApiError(409, "Choose a playground to continue.");
  if(!/^[a-f0-9-]{36}$/i.test(guildId)) throw new ApiError(403,'You do not have access to this playground.');
  const guild = await database<Guild>('guild_context',user,guildId);
  if (!guild) throw new ApiError(403, "You do not have access to this playground.");
  if (request.headers.get('X-Guild-ID') && request.headers.get('X-Guild-ID') !== guild.id) throw new ApiError(409,'Your active guild changed. Reload this page before continuing.');
  return { user, guild };
}
export function requireAdmin(guild: Guild) {
  if (guild.role !== 'owner') throw new ApiError(403, "Only the playground owner can manage users and settings.");
}
export function checkMutation(request: Request) {
  if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
  const context=request.headers.get('X-NAOL-Context');
  const value=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(impersonationCookie+'='))?.slice(impersonationCookie.length+1);
  if(!impersonationMutationContextMatches(value,context))throw new ApiError(409,'Your account context changed. Reload this page before making changes.');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403,'Use this website to make changes.');
}
export function guildCookie(id: string, request: Request, userId: string) {
  return `loot_manager_playground_${userId}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
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
export async function ledger(guildId: string,user?:AccountUser) {
  return database<{state:LootState;version:number}>(user?'ledger_get':'public_ledger',user,guildId);
}
export async function publicGuild(request: Request) {
  const params=new URL(request.url).searchParams;
  const slug = params.get('playground') ?? params.get('guild') ?? '';
  if (!slug) throw new ApiError(400, "Choose a playground first.");
  const guild = await database<Guild>('public_guild',undefined,undefined,{slug,feature:new URL(request.url).pathname.includes('shop')?'shop':'inquiries'});
  if (!guild) throw new ApiError(404, "This playground has not published its shop and inquiries.");
  return guild;
}
export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2,'0')).join('');
}
