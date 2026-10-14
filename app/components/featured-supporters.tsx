import {ArrowRight,Heart} from 'lucide-react';
import {database} from '../../lib/supabase-store';
import type {Supporter} from '../../lib/support';
import {SupporterCarousel} from './supporter-carousel';
export async function FeaturedSupporters(){
  let supporters:Supporter[];try{supporters=await database<Supporter[]>('supporters_featured');}catch{return null;}
  if(!supporters.length)return null;
  return <section className="featured-supporters" aria-label="Community supporters"><div className="featured-supporters-heading"><div><span className="lm-eyebrow"><Heart size={14}/>POWERED BY OUR COMMUNITY</span><p>The players and playgrounds helping keep NAOL free for everyone.</p></div><a className="lm-text-link" href="/supporters">Meet all supporters <ArrowRight size={16}/></a></div><SupporterCarousel supporters={supporters}/></section>;
}
