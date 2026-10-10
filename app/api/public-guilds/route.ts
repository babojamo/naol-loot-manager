import { api, json } from "../../../lib/tenant";
import { database } from '../../../lib/supabase-store';
export async function GET(request: Request) { return api(async () => {
  const feature=new URL(request.url).searchParams.get('feature');
  const results = await database('public_list',undefined,undefined,{feature:feature==='inquiries'?'inquiries':'shop'});
  return json({ guilds: results });
},request); }
