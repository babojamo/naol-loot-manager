"use client";
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {Supporter} from '../../lib/support';
import {SupporterEmblem} from './supporter-emblem';
import {PlaygroundIcon} from './playground-icon';

export function SupporterCarousel({supporters}:{supporters:Supporter[]}){
  const row=useRef<HTMLUListElement>(null);
  const [edges,setEdges]=useState({start:true,end:true});
  useEffect(()=>{
    const list=row.current;if(!list)return;
    const update=()=>setEdges({start:list.scrollLeft<=2,end:list.scrollLeft+list.clientWidth>=list.scrollWidth-2});
    update();list.addEventListener('scroll',update,{passive:true});
    const observer=new ResizeObserver(update);observer.observe(list);for(const child of list.children)observer.observe(child);
    return()=>{list.removeEventListener('scroll',update);observer.disconnect();};
  },[supporters]);
  function move(direction:number){const list=row.current;if(list)list.scrollBy({left:direction*Math.max(280,list.clientWidth*.85),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  return <div className="supporter-carousel"><button type="button" className="supporter-carousel-arrow" aria-label="Previous supporters" aria-controls="home-supporters" disabled={edges.start} onClick={()=>move(-1)}><ChevronLeft size={20}/></button><ul ref={row} id="home-supporters" tabIndex={0} className="featured-supporters-row" aria-label="Featured supporter playgrounds">{supporters.map(s=><li key={s.username}><PlaygroundIcon icon={s.playground.icon} name={s.playground.name}/><div><span className={s.badge==='Legend Supporter'?'featured-badge is-legend':'featured-badge'}>{s.badge}</span><h3>{s.playground.name}</h3><p>@{s.username}</p></div><SupporterEmblem badge={s.badge}/></li>)}</ul><button type="button" className="supporter-carousel-arrow" aria-label="Next supporters" aria-controls="home-supporters" disabled={edges.end} onClick={()=>move(1)}><ChevronRight size={20}/></button></div>;
}
