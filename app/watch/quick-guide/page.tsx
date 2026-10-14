import type {Metadata} from 'next';
import {quickGuide} from '../../../lib/quick-guide';
import {QuickGuideVideo} from '../../components/quick-guide-video';
import {ShareQuickGuide} from '../../components/share-quick-guide';
import {SiteNav,SiteFooter} from '../../components/site-nav';
import {ArrowRight,ScanLine,Coins,Mail,ShieldCheck} from 'lucide-react';
export const metadata:Metadata={
  title:{absolute:`${quickGuide.title} | NAOL`},description:quickGuide.description,
  alternates:{canonical:quickGuide.url},
  openGraph:{type:'video.other',url:quickGuide.url,siteName:'NAOL',title:quickGuide.title,description:quickGuide.description,
    images:[{url:quickGuide.poster,secureUrl:quickGuide.poster,type:'image/jpeg',width:1280,height:720,alt:'NAOL quick guide showing the playground loot overview and party payout queue.'}],
    videos:[{url:quickGuide.stream,secureUrl:quickGuide.stream,type:'application/vnd.apple.mpegurl',width:1920,height:1080}]},
  twitter:{card:'summary_large_image',title:quickGuide.title,description:quickGuide.description,images:[{url:quickGuide.poster,alt:'Watch the NAOL guide to creating runs, selling loot and preparing salary mail.'}]},
  other:{'video:duration':'355','video:tag':['NAOL','Dungeon runs','Loot management','Salaries','Mailing Helper']},
};
export default function QuickGuideWatchPage(){return <main className="marketing"><SiteNav/><section className="video-watch-page"><header><span className="lm-eyebrow">SEE NAOL IN ACTION</span><h1>From your first drop<br/>to everyone’s salary.</h1><p>Learn how to create a dungeon run, track loot sales and prepare your party’s in-game salary mail—all in one quick walkthrough.</p><div className="video-watch-facts"><span>5 min 55 sec</span><span>1080p</span><span>No account needed to watch</span></div></header><QuickGuideVideo/><ShareQuickGuide/><div className="video-watch-topics"><article><ScanLine size={22}/><h2>Read your party screenshot</h2><p>Paste the party list, review the names and choose your dungeon.</p></article><article><ShieldCheck size={22}/><h2>Record every drop</h2><p>Save the run, party members and loot quantities together.</p></article><article><Coins size={22}/><h2>Record sales & salaries</h2><p>Enter the sold quantity and actual price to calculate each member’s share.</p></article><article><Mail size={22}/><h2>Copy ready-made salary mail</h2><p>Copy the recipient, mail header, content and salary amount into the game.</p></article></div><div className="video-watch-cta"><a className="lm-button" href="/register">Start for Free <ArrowRight size={17}/></a><a className="lm-text-link" href="/guide">Read the app guide <ArrowRight size={16}/></a></div></section><SiteFooter/></main>;}
