import {ArrowRight,Heart} from 'lucide-react';
import {database} from '../../lib/supabase-store';
import type {Supporter} from '../../lib/support';
import {SupporterEmblem} from './supporter-emblem';
import {PlaygroundIcon} from './playground-icon';
export async function FeaturedSupporters(){
  let supporters:Supporter[];try{supporters=await database<Supporter[]>('supporters_featured');}catch{return null;}
  if(!supporters.length)return null;
  return <section className="featured-supporters" aria-label="Community supporters"><div className="featured-supporters-heading"><div><span className="lm-eyebrow"><Heart size={14}/>POWERED BY OUR COMMUNITY</span><p>The players and playgrounds helping keep NAOL free for everyone.</p></div><a className="lm-text-link" href="/supporters">Meet all supporters <ArrowRight size={16}/></a></div><ul tabIndex={0} className="featured-supporters-row" aria-label="Featured supporter playgrounds">{supporters.map(s=><li key={s.username}><PlaygroundIcon icon={s.playground.icon} name={s.playground.name}/><div><span className={s.badge==='Legend Supporter'?'featured-badge is-legend':'featured-badge'}>{s.badge}</span><h3>{s.playground.name}</h3><p>@{s.username}</p></div><SupporterEmblem badge={s.badge}/></li>)}</ul></section>;
}
