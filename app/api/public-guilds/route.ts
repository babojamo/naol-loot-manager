import { api, json } from "../../../lib/tenant";
import { database } from '../../../lib/supabase-store';
export async function GET(request: Request) { return api(async () => {
  const results = await database('public_list');
  return json({ guilds: results });
},request); }
