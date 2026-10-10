import { z } from 'zod';
import { api, guildContext, requireAdmin, tokenHash, json, ApiError } from '../../../../lib/tenant';
import { database } from '../../../../lib/supabase-store';
import {env} from 'cloudflare:workers';
import {sendInvitationEmail} from '../../../../lib/invitation-delivery';
export async function POST(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.object({email:z.string().trim().email().max(200),role:z.literal('manager').default('manager')}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Enter a valid email and role.');
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const expiresAt=new Date(Date.now()+7*86400000).toISOString();
  const id=crypto.randomUUID(),joinPath=`/join?token=${token}`;
  await database('invite_create',user,guild.id,{...parsed.data,id,tokenHash:await tokenHash(token),expiresAt});
  // Send only after the authorized invitation has been successfully saved.
  // A mail failure must not discard the invitation or its copyable link.
  const emailSent=Boolean(env.RESEND_API_KEY&&env.CONTACT_FROM_EMAIL)&&await sendInvitationEmail({key:env.RESEND_API_KEY!,from:env.CONTACT_FROM_EMAIL!,email:parsed.data.email,playground:guild.name,inviter:user.displayName,id,joinPath});
  return json({joinPath,expiresAt,emailSent},201);
},request);}
