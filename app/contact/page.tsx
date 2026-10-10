import {getAccountUser} from '../../lib/account-auth';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {ContactForm} from '../components/contact-form';
export const dynamic='force-dynamic';
export const metadata={title:'Contact NAOL',description:'Ask a question or discuss a custom NAOL plan.'};
export default async function Contact({searchParams}:{searchParams:Promise<{subject?:string}>}){
  const user=await getAccountUser();const {subject}=await searchParams;
  return <main className="marketing"><SiteNav/><section className="portal-container"><div className="section-intro"><span className="lm-eyebrow">LET’S TALK</span><h1>Your party.<br/><em>Your questions.</em></h1><p>Need a custom plan or help with NAOL? Send a message to the platform administrator.</p></div><ContactForm initialEmail={user?.email??''} initialSubject={subject?.slice(0,160)??''}/></section><SiteFooter/></main>;
}
