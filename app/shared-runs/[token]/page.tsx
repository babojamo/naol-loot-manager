import type {Metadata} from 'next';
import {getAccountUser} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
import {ApiError,tokenHash} from '../../../lib/tenant';
import {projectSharedRun,type SharedRunSource} from '../../../lib/shared-run';
import {authLink} from '../../../lib/auth-continuation';
import {SiteNav,SiteFooter} from '../../components/site-nav';
import {EmailVerification} from '../../components/email-verification';
import {PlaygroundIcon} from '../../components/playground-icon';
import {PenyaAmount} from '../../components/penya';
import {Gem,Globe,Lock,Users} from 'lucide-react';
export const dynamic='force-dynamic';
type Props={params:Promise<{token:string}>};
const validToken=(token:string)=>/^[a-f0-9]{64}$/.test(token);
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {token}=await params;
  let title='Shared dungeon run',description='View a shared dungeon run on NAOL. Sign in with an invited email address to open a private run.';
  try{
    if(validToken(token)){
      const source=await database<SharedRunSource|{restricted:true}>('run_share_preview',undefined,undefined,{tokenHash:await tokenHash(token)});
      if('state' in source){const run=projectSharedRun(source);if(run){title=`${run.dungeon} — ${run.playground}`;description=`${new Date(run.date).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'Asia/Singapore'})} · ${run.members.length} party members · ${run.loots.map(l=>`${l.quantity} × ${l.name}`).join(', ')}. View current loot status and vending prices on NAOL.`.slice(0,300);}}
    }
  }catch{/* Unavailable or private shares never disclose run information in metadata. */}
  const url=validToken(token)?`https://naol.lokwensio.com/shared-runs/${token}`:undefined;
  const image={url:'https://naol.lokwensio.com/brand/naol-logo.png',width:1440,height:1094,alt:'NAOL — Where every drop makes someone jealous.'};
  return {title,description,robots:{index:false,follow:false},referrer:'no-referrer',alternates:{canonical:url},
    openGraph:{title:`${title} | NAOL`,description,url,siteName:'NAOL',type:'website',images:[image]},
    twitter:{card:'summary_large_image',title:`${title} | NAOL`,description,images:[image.url]}};
}
export default async function SharedRunPage({params}:Props){
  const {token}=await params;const path=`/shared-runs/${token}`;
  let run:ReturnType<typeof projectSharedRun>=null,error='',status=404;
  const user=validToken(token)?await getAccountUser():null;
  try{
    if(!validToken(token))throw new ApiError(404,'This shared run is unavailable.');
    run=projectSharedRun(await database<SharedRunSource>('run_share_view',user??undefined,undefined,{tokenHash:await tokenHash(token)}));
    if(!run)throw new ApiError(404,'This shared run is unavailable.');
  }catch(e){status=e instanceof ApiError?e.status:503;error=e instanceof ApiError?e.message:'Could not load this shared run. Please try again.';}
  return <main className="marketing shared-run-page"><SiteNav/><div className="portal-container shared-run-container">
    {run?<><header className="shared-run-heading"><div className="shared-run-playground"><PlaygroundIcon icon={run.icon} name={run.playground}/><span>{run.playground}</span></div><span className="shared-run-access">{run.restricted?<Lock size={14}/>:<Globe size={14}/>} {run.restricted?'Shared with invited accounts':'Public shared run'}</span><h1>{run.dungeon}</h1><p>{new Date(run.date).toLocaleString('en-US',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Singapore'})} (Singapore time) · Added by {run.createdBy}</p><small>Read-only view · Updated when this run or its loot changes</small></header>
      <section className="portal-card shared-run-party"><h2><Users size={21}/>Party members <span>{run.members.length}</span></h2><div className="chips">{run.members.map((name,i)=><span className="member-chip" key={i}>{name}</span>)}</div></section>
      <section className="shared-run-loots"><h2>Loot & sale status</h2><div className="shared-loot-grid">{run.loots.map((loot,i)=><article className="shared-loot-card" key={i}><div className="shared-loot-image">{loot.image?<img src={loot.image} alt={loot.name}/>:<Gem size={44}/>}</div><div className="shared-loot-details"><h3>{loot.name}</h3><span className={`loot-sale-status ${loot.sold>=loot.quantity?'complete':loot.sold?'partial':'unsold'}`}>{loot.sold>=loot.quantity?'All sold':loot.sold?`${loot.sold} of ${loot.quantity} sold`:'Unsold'}</span><dl><div><dt>Collected</dt><dd>{loot.quantity.toLocaleString()}</dd></div><div><dt>Sold</dt><dd>{loot.sold.toLocaleString()}</dd></div><div><dt>Remaining in this run</dt><dd>{loot.available.toLocaleString()}</dd></div><div className="shared-loot-price"><dt>Current vending price / piece</dt><dd>{loot.vendingPrice!==null?<PenyaAmount value={loot.vendingPrice}/>:<span>Not set</span>}</dd></div></dl></div></article>)}</div>{!run.loots.length&&<p>No loot recorded in this run.</p>}<p className="shared-price-note">Vending prices are the current asking prices, and may differ from recorded sale prices.</p></section>
    </>:<section className="portal-card shared-run-unavailable"><Lock size={30}/><h1>{status===401?'Sign in to view this run':status===403?'Access to this run is restricted':'Shared run unavailable'}</h1><p role="status">{error}</p>{status===401&&<div className="hero-actions"><a className="lm-button" href={authLink('/login',path)}>Sign in</a><a className="lm-button secondary-lm" href={authLink('/register',path)}>Create an account</a></div>}{status===403&&user&&error.startsWith('Verify your email')&&<EmailVerification email={user.email} returnTo={path}/>}<a className="lm-text-link" href="/">Back to NAOL →</a></section>}
  </div><SiteFooter/></main>;
}
