import {authContinuation} from '../../lib/auth-continuation';
import {getAccountUser} from '../../lib/account-auth';
import {redirect} from 'next/navigation';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {AccountForm} from '../components/account-form';
export const dynamic='force-dynamic';
export const metadata={title:'Create an account'};
export default async function Register({searchParams}:{searchParams:Promise<{next?:string}>}){const next=authContinuation((await searchParams).next);if(await getAccountUser())redirect(next);return <main className="marketing"><SiteNav/><section className="access-page"><div className="access-copy"><span className="lm-eyebrow">MORE ADVENTURE. LESS ADMIN.</span><h1>Your party.<br/><em>Your playground.</em></h1><p>Start on Community for free, create your own playground, or join another owner’s team with their playground code.</p><a className="lm-text-link" href="/support">Free for everyone. Supported by players →</a></div><AccountForm register returnTo={next}/></section><SiteFooter/></main>;}
