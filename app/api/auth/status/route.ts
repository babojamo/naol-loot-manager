import { getAccountUser } from "../../../../lib/account-auth";
import { api, guildContext, json, ApiError } from "../../../../lib/tenant";
import {database} from '../../../../lib/supabase-store';
export async function GET(request: Request) {
  return api(async () => {
    const user = await getAccountUser();
    if (!user) return json({ authenticated: false });
    const account=await database<{plan:'Free'|'Elite'|'Legend'}>('account',user);
    try { const { guild } = await guildContext(request); return json({ authenticated: true, username: user.displayName, plan:account.plan, guild }); }
    catch(e) { if (e instanceof ApiError && [403,409].includes(e.status)) return json({ authenticated: true, username: user.displayName, plan:account.plan, guild: null }); throw e; }
  });
}
