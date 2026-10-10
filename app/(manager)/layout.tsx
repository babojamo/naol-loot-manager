import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { guildContext, ApiError } from '../../lib/tenant';
import { getChatGPTUser } from '../chatgpt-auth';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function ManagerLayout({children}:{children:React.ReactNode}) {
  if(!(await getChatGPTUser()))redirect('/login');
  let allowed=true;
  try {await guildContext(new Request('https://loot-manager.lokwensio.com/overview',{headers:await headers()}));}
  catch(e){if(e instanceof ApiError && [403,409].includes(e.status))allowed=false;else throw e;}
  if(!allowed)redirect('/guilds');return children;
}
