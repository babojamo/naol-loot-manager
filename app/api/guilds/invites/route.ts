import { z } from 'zod';
import { api, guildContext, requireAdmin, tokenHash, json, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
export async function POST(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.object({email:z.string().trim().email().max(200),role:z.literal('manager').default('manager')}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Enter a valid email and role.');
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const expiresAt=new Date(Date.now()+7*86400000).toISOString();
  await database('invite_create',user,guild.id,{...parsed.data,id:crypto.randomUUID(),tokenHash:await tokenHash(token),expiresAt});
  return json({joinPath:`/join?token=${token}`,expiresAt},201);
},request);}
