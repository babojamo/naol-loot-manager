import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { guildContext, ApiError } from '../../lib/tenant';
import { getAccountUser } from '../../lib/account-auth';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function ManagerLayout({children}:{children:React.ReactNode}) {
  if(!(await getAccountUser()))redirect('/login');
  let allowed=true;
  try {await guildContext(new Request('https://loot-manager.lokwensio.com/overview',{headers:await headers()}));}
  catch(e){if(e instanceof ApiError && [403,409].includes(e.status))allowed=false;else throw e;}
  if(!allowed)redirect('/playgrounds');return children;
}
