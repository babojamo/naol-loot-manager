import {getAccountUser} from '../../lib/account-auth';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {ContactForm} from '../components/contact-form';
import {database} from '../../lib/supabase-store';
import {isRequestedPlan,planRequestDraft} from '../../lib/plan-request';
export const dynamic='force-dynamic';
export const metadata={title:'Contact NAOL',description:'Ask a question or discuss a custom NAOL plan.'};
export default async function Contact({searchParams}:{searchParams:Promise<{subject?:string;request?:string;plan?:string}>}){
  const user=await getAccountUser();const params=await searchParams;
  let subject=params.subject?.slice(0,160)??'',message='';
  if(user&&params.request==='plan'&&isRequestedPlan(params.plan)){
    const account=await database<{name:string;username:string;plan:string}>('account',user);
    const draft=planRequestDraft(params.plan,account);subject=draft.subject;message=draft.message;
  }
  return <main className="marketing"><SiteNav/><section className="portal-container"><div className="section-intro"><span className="lm-eyebrow">LET’S TALK</span><h1>Your party.<br/><em>Your questions.</em></h1><p>Need a custom plan or help with NAOL? Send a message to the platform administrator.</p></div><ContactForm key={`${params.request??''}:${params.plan??''}`} initialEmail={user?.email??''} initialSubject={subject} initialMessage={message}/></section><SiteFooter/></main>;
}
