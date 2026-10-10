import {z} from 'zod';
import {api,guildContext,requireAdmin,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
import {flushDiscord} from '../../../../lib/playground-discord';
export async function PUT(request:Request){return api(async()=>{
  const {guild,user}=await guildContext(request);requireAdmin(guild);
  const parsed=z.object({enabled:z.boolean(),webhookUrl:z.string().trim().max(250).refine(v=>v===''||/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(v)),clear:z.boolean().default(false)}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,'Enter a valid Discord webhook URL.');
  await database('discord_config',user,guild.id,parsed.data);return json({ok:true,...await flushDiscord(user,guild.id)});
},request);}
export async function POST(request:Request){return api(async()=>{const {guild,user}=await guildContext(request);requireAdmin(guild);const parsed=z.object({test:z.boolean().optional()}).safeParse(await request.json());if(!parsed.success)throw new ApiError(400,'Choose a valid Discord action.');if(parsed.data.test)await database('discord_test',user,guild.id);return json(await flushDiscord(user,guild.id));},request);}
