import { getChatGPTUser, chatGPTSignInPath } from '../chatgpt-auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { guildContext, ApiError } from '../../lib/tenant';
import { SiteNav, SiteFooter } from '../components/site-nav';
import { ShieldCheck, ArrowRight } from 'lucide-react';
export const dynamic='force-dynamic';
export const metadata={title:'Sign in',robots:{index:false,follow:false}};
export default async function Login(){
  if(await getChatGPTUser()){
    let path='/guilds';try{await guildContext(new Request('https://loot-manager.lokwensio.com/login',{headers:await headers()}));path='/overview';}catch(e){if(!(e instanceof ApiError))throw e;}redirect(path);
  }
  return <main className="marketing"><SiteNav/><section className="access-page"><div className="access-copy"><span className="lm-eyebrow">YOUR GUILD, READY WHEN YOU ARE</span><h1>Every drop.<br/><em>One workspace.</em></h1><p>Manage your guilds and share the work with the people you trust.</p></div><div className="access-card"><span className="feature-icon"><ShieldCheck/></span><h2>Sign in to Loot Manager</h2><p>Use your ChatGPT account to create a guild or join a manager invitation. Your account can belong to more than one guild.</p><a className="lm-button" href={chatGPTSignInPath('/guilds')} target="_top">Continue with ChatGPT <ArrowRight size={18}/></a><small>Invited? Open your invitation link and use the account with the invited email address.</small></div></section><SiteFooter/></main>;
}
