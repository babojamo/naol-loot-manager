import { getAccountUser } from "../../../../lib/account-auth";
import { api, guildContext, json, ApiError } from "../../../../lib/tenant";
import {database} from '../../../../lib/supabase-store';
import {accountRecognition} from '../../../../lib/account-recognition';
export async function GET(request: Request) {
  return api(async () => {
    const user = await getAccountUser();
    if (!user) return json({ authenticated: false });
    const account=await database<{id:string;plan:'Free'|'Elite'|'Legend'}>('account',user);
    const badge=await accountRecognition(account);
    try { const { guild } = await guildContext(request); return json({ authenticated: true, username: user.displayName, plan:account.plan, badge, guild }); }
    catch(e) { if (e instanceof ApiError && [403,409].includes(e.status)) return json({ authenticated: true, username: user.displayName, plan:account.plan, badge, guild: null }); throw e; }
  });
}
