"use client";
import {useEffect,useRef,useState} from 'react';
import {LogOut,UserRoundSearch} from 'lucide-react';
export function notifyAccountContextChange(){if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('naol-account-context');channel.postMessage('changed');channel.close();}}
export function ImpersonationBanner({enabled}:{enabled:boolean}){
  const [status,setStatus]=useState<{active:boolean;target?:{username:string;name:string};expiresAt?:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const banner=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    async function update(){try{const response=await fetch('/api/platform/impersonation',{cache:'no-store'});if(!response.ok)throw Error('Could not verify impersonation.');const value=await response.json() as {active:boolean;target?:{username:string;name:string};expiresAt?:string};if(active)setStatus(value);}catch{if(active)setStatus({active:false});}}
    void update();const timer=setInterval(()=>void update(),30000);return()=>{active=false;clearInterval(timer);};
  },[enabled]);
  useEffect(()=>{
    if(!enabled||!banner.current)return;
    const update=()=>document.documentElement.style.setProperty('--impersonation-height',`${banner.current?.offsetHeight??72}px`);
    document.body.classList.add('is-impersonating');update();const observer=new ResizeObserver(update);observer.observe(banner.current);
    return()=>{observer.disconnect();document.body.classList.remove('is-impersonating');document.documentElement.style.removeProperty('--impersonation-height');};
  },[enabled]);
  if(!enabled)return null;
  return <aside className="impersonation-banner" ref={banner} aria-label="Administrator impersonation"><UserRoundSearch size={22}/><div><strong>{status?.active?`Impersonating ${status.target?.name} (@${status.target?.username})`:status?'Impersonation ended or is unavailable':'Administrator impersonation'}</strong><span>{status?.active?'Changes affect this user’s real playgrounds and are audited. Account credentials and Platform Admin are unavailable.':status?'Exit impersonation to return to your administrator account.':'Checking the impersonation session…'}{status?.active&&status.expiresAt&&` Ends at ${new Date(status.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.`}</span>{error&&<span role="alert">{error}</span>}</div><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const response=await fetch('/api/platform/impersonation',{method:'DELETE'});const data=await response.json() as {next?:string;error?:string};if(!response.ok)throw Error(data.error||'Could not exit impersonation.');notifyAccountContextChange();window.location.assign(data.next||'/admin');}catch(e){setError((e as Error).message);setBusy(false);}}}><LogOut size={16}/>{busy?'Exiting…':'Exit impersonation'}</button></aside>;
}
