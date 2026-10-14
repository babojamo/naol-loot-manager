import {requireAccountUser} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
import {SiteNav} from '../../components/site-nav';
import {AdminMail} from '../../components/admin-mail';
export const dynamic='force-dynamic';
export const metadata={title:'Admin mail',robots:{index:false,follow:false}};
export default async function MailPage(){const user=await requireAccountUser('/admin/mail');const account=await database<{platform_admin:boolean}>('account',user);if(!account.platform_admin)return <main className="marketing"><SiteNav/><section className="portal-container"><h1>Administrator access required.</h1><a href="/playgrounds">Your playgrounds →</a></section></main>;return <AdminMail/>;}
