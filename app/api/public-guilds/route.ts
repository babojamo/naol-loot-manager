import { api, db, json } from "../../../lib/tenant";
export async function GET(request: Request) { return api(async () => {
  const { results } = await db().prepare('SELECT name,slug,description FROM guilds WHERE is_public=1 ORDER BY name LIMIT 200').all();
  return json({ guilds: results });
},request); }
