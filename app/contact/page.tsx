import {getAccountUser} from '../../lib/account-auth';
import {SiteNav,SiteFooter} from '../components/site-nav';
import {ContactForm} from '../components/contact-form';
import {database} from '../../lib/supabase-store';
import {isRequestedPlan,planRequestDraft} from '../../lib/plan-request';
export const dynamic='force-dynamic';
export const metadata={title:'Contact NAOL',description:'Ask a question, subscribe as a supporter or arrange an optional donation to NAOL.'};
export default async function Contact({searchParams}:{searchParams:Promise<{subject?:string;request?:string;plan?:string}>}){
  const user=await getAccountUser();const params=await searchParams;
  let subject=params.subject?.slice(0,160)??'',message='';
  if(params.request==='plan'&&isRequestedPlan(params.plan)){
    const account=user?await database<{name:string;username:string;plan:string}>('account',user):{name:'',username:'',plan:'Free'};
    const draft=planRequestDraft(params.plan,account);subject=draft.subject;message=draft.message;
  }
  if(params.request==='donation'){subject='One-time donation to NAOL';message='Hello NAOL team,\n\nI would like to make a one-time donation to help keep NAOL free for the community.\n\nContribution amount: [Any amount you would like to give]\nIn-game character and server: [Your details]\nShowcase playground (optional): [A playground you own or manage]\n\nPlease let me know how to arrange my contribution.\n\nThank you.';}
  return <main className="marketing"><SiteNav/><section className="portal-container"><div className="section-intro"><span className="lm-eyebrow">LET’S TALK</span><h1>Your party.<br/><em>Your community.</em></h1><p>Ask a question, arrange a donation or discuss optional supporter benefits with the NAOL team. Review your message before sending.</p></div><ContactForm key={`${params.request??''}:${params.plan??''}`} initialEmail={user?.email??''} initialSubject={subject} initialMessage={message}/></section><SiteFooter/></main>;
}
