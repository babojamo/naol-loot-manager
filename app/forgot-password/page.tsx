import {SiteNav,SiteFooter} from '../components/site-nav';
import {PasswordReset} from '../components/password-reset';
export const dynamic='force-dynamic';
export const metadata={title:'Reset your password',robots:{index:false,follow:false}};
export default async function ForgotPassword({searchParams}:{searchParams:Promise<{error?:string}>}){
  const error=(await searchParams).error;
  return <main className="marketing"><SiteNav/><section className="password-reset-page"><PasswordReset error={error==='link'?'This reset link could not be completed. Request a fresh link and open it in the same browser.':error==='impersonation'?'Exit impersonation before opening a password reset link. Then reopen the link from your email.':error==='account'?'This account cannot use password recovery right now. Contact NAOL for help.':''}/></section><SiteFooter/></main>;
}
