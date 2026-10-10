import { z } from 'zod';
import { api, guildContext, json, ledger, ApiError } from '../../../lib/tenant';
import { database } from '../../../lib/supabase-store';
import { stateSchema } from '../../../lib/state-validation';
function canonical(value: unknown): string {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value) ?? 'null';
}
export async function GET(request: Request) { return api(async () => {
  const {guild,user}=await guildContext(request);
  const data=await ledger(guild.id,user);
  return json({...data,guildId:guild.id,connected:true});
},request); }
export async function PUT(request: Request) { return api(async () => {
  const {guild,user}=await guildContext(request);
  if(!['owner','admin','manager'].includes(guild.role ?? '')) throw new ApiError(403,'You cannot edit this guild.');
  const text=await request.text();
  if(new TextEncoder().encode(text).length>1500000) throw new ApiError(413,'The ledger is too large. Reduce the size of uploaded loot photos.');
  const parsed=z.object({guildId:z.string(),version:z.number().int().nonnegative(),action:z.string().max(200),state:stateSchema}).safeParse(JSON.parse(text));
  if(!parsed.success) throw new ApiError(400,parsed.error.issues[0]?.message ?? 'Check the ledger data.');
  if(parsed.data.guildId!==guild.id) throw new ApiError(409,'Your active guild changed in another tab. Reload before saving.');
  const previous=await ledger(guild.id,user);
  if(previous.version!==parsed.data.version) throw new ApiError(409,'Another manager saved changes. Reload the ledger before trying again.');
  const next=parsed.data.state;
  for(const sale of previous.state.sales) {
    const saved=next.sales.find(s=>s.id===sale.id);
    if(!saved || canonical(saved)!==canonical(sale)) throw new ApiError(400,'Recorded sales and payouts cannot be changed.');
  }
  for(const before of previous.state.runs) {
    const hasSale=previous.state.sales.some(s=>s.allocations?.some(a=>before.loots.some(l=>l.id===a.runLootId)));
    const after=next.runs.find(r=>r.id===before.id);
    if(hasSale && canonical(before)!==canonical(after)) throw new ApiError(400,'A run with sold loot cannot be changed.');
  }
  const now=new Date().toISOString();
  next.auditLog=[{id:crypto.randomUUID(),username:user.displayName,action:parsed.data.action,createdAt:now},...previous.state.auditLog].slice(0,100);
  next.lastUpdatedBy=user.displayName; next.lastUpdatedAt=now;
  await database('ledger_save',user,guild.id,{state:next,version:parsed.data.version});
  return json({ok:true,state:next,version:parsed.data.version+1,guildId:guild.id});
},request); }
