"use client";
import {useEffect,useRef,useState} from 'react';
import {Play,LoaderCircle} from 'lucide-react';

export function QuickGuideVideo() {
  const video=useRef<HTMLVideoElement>(null);
  const [started,setStarted]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!started || !video.current) return;
    const element=video.current;
    let disposed=false;
    let player:import('hls.js').default|undefined;
    setLoading(true);setError('');
    const ready=()=>setLoading(false);
    const failed=()=>{setLoading(false);setError('The guide could not load. Please try again.');};
    element.addEventListener('canplay',ready);element.addEventListener('error',failed);
    const load=async()=>{
      if(element.canPlayType('application/vnd.apple.mpegurl')) {
        element.src='/api/guide-video';
        void element.play().catch(()=>setLoading(false));return;
      }
      const {default:Hls}=await import('hls.js');
      if(disposed) return;
      if(!Hls.isSupported()){failed();return;}
      player=new Hls({maxBufferLength:30,maxMaxBufferLength:60});
      player.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)failed();});
      player.on(Hls.Events.MANIFEST_PARSED,()=>{void element.play().catch(()=>setLoading(false));});
      player.loadSource('/api/guide-video');player.attachMedia(element);
    };
    void load().catch(failed);
    return()=>{disposed=true;player?.destroy();element.removeEventListener('canplay',ready);element.removeEventListener('error',failed);element.pause();element.removeAttribute('src');element.load();};
  },[started]);
  return <div className="quick-guide-player"><video ref={video} controls={started} playsInline preload="none" poster="/guide-video/poster.jpg" aria-label="NAOL quick guide: creating dungeon runs and recording sales and salaries"/>{!started&&<button type="button" className="quick-guide-play" onClick={()=>setStarted(true)}><span><Play size={27} fill="currentColor"/></span><strong>Watch the quick guide</strong><small>5 min 55 sec · 1080p</small></button>}{loading&&<span className="quick-guide-loading" role="status"><LoaderCircle className="spin" size={20}/> Loading guide…</span>}{error&&<div className="quick-guide-error" role="alert"><p>{error}</p><button type="button" onClick={()=>setStarted(false)}>Try again</button></div>}</div>;
}
