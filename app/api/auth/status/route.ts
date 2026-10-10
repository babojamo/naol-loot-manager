import { getChatGPTUser } from "../../../chatgpt-auth";
import { api, guildContext, json, ApiError } from "../../../../lib/tenant";
export async function GET(request: Request) {
  return api(async () => {
    const user = await getChatGPTUser();
    if (!user) return json({ authenticated: false });
    try { const { guild } = await guildContext(request); return json({ authenticated: true, username: user.displayName, guild }); }
    catch(e) { if (e instanceof ApiError && [403,409].includes(e.status)) return json({ authenticated: true, username: user.displayName, guild: null }); throw e; }
  });
}
