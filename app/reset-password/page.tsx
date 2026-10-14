import {SiteNav,SiteFooter} from '../components/site-nav';
import {PasswordReset} from '../components/password-reset';
import {recoverySession} from '../../lib/password-recovery-server';
import {database} from '../../lib/supabase-store';
export const dynamic='force-dynamic';
export const metadata={title:'Choose a new password',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function ResetPassword(){
  const session=await recoverySession();let valid=false;if(session){try{await database('account',session.user);valid=true;}catch{}}
  return <main className="marketing"><SiteNav/><section className="password-reset-page"><PasswordReset recovery valid={valid} error={valid?'':'Open the reset link from your email first. If it has expired or was opened in another browser, request a new link.'}/></section><SiteFooter/></main>;
}
