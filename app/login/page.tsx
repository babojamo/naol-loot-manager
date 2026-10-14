import {authContinuation} from '../../lib/auth-continuation';
import {getAccountUser} from '../../lib/account-auth';
import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {guildContext,ApiError} from '../../lib/tenant';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {AccountForm} from '../components/account-form';
export const dynamic='force-dynamic';
export const metadata={title:'Sign in',robots:{index:false,follow:false}};
export default async function Login({searchParams}:{searchParams:Promise<{next?:string;confirmation?:string;account?:string;password?:string}>}){
  const params=await searchParams;const next=authContinuation(params.next);
  if(await getAccountUser()){
    let path=next;try{await guildContext(new Request('https://naol.lokwensio.com/login',{headers:await headers()}));if(next==='/playgrounds')path='/overview';}catch(e){if(!(e instanceof ApiError))throw e;}redirect(path);
  }
  return <main className="marketing"><SiteNav/><section className="access-page"><div className="access-copy"><span className="lm-eyebrow">YOUR NEXT ADVENTURE STARTS HERE</span><h1>Every drop.<br/><em>One workspace.</em></h1><p>Your playgrounds, your party, your rewards. Together in one place.</p>{params.password==='reset'&&<p className="portal-alert account-success" role="status">Your password has been reset. Sign in with your new password.</p>}{params.account==='deletion-scheduled'&&<p className="portal-alert" role="status">Your account is deactivated and scheduled for permanent deletion after 30 days. If you change your mind, <a href="/contact">contact NAOL</a> before the deadline. Signing in does not cancel deletion.</p>}{params.confirmation==='failed'&&<p role="alert">This confirmation link could not be completed. Try signing in if your email is already verified.</p>}</div><AccountForm returnTo={next}/></section><SiteFooter/></main>;
}
