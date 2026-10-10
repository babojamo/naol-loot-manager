import {requireAccountUser} from '../../lib/account-auth';
import {database} from '../../lib/supabase-store';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {PlatformAdmin} from '../components/platform-admin';
export const dynamic='force-dynamic';
export const metadata={title:'Platform administration',robots:{index:false,follow:false}};
export default async function Admin(){const user=await requireAccountUser();const account=await database<{platform_admin:boolean}>('account',user);if(!account.platform_admin)return <main className="marketing"><SiteNav/><section className="portal-container"><h1>Administrator access required.</h1><a href="/playgrounds">Back to your playgrounds →</a></section><SiteFooter/></main>;return <PlatformAdmin/>;}
