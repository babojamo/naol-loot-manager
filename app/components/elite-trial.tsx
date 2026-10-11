"use client";
import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {Sparkles} from 'lucide-react';
import {useAccountAuth} from './account-session';
import type {Account} from './guild-workspace';

export function EliteTrial({account,onStarted}:{account:Account;onStarted:()=>Promise<unknown>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=Boolean(account.elite_trial_started_at && !account.elite_trial_cancelled_at && account.elite_trial_ends_at && new Date(account.elite_trial_ends_at).getTime()>Date.now());
  const paused=account.plan_paused && (!account.plan_paused_until || new Date(account.plan_paused_until).getTime()>Date.now());
  if(active) return <div className="elite-trial-card"><strong><Sparkles size={19}/> Your 15-day Elite trial is active</strong><p>Ends {new Date(account.elite_trial_ends_at!).toLocaleString()}. Your account returns to Free automatically unless the administrator assigns a paid plan. Your data stays safe.</p><a href="/contact?request=plan&plan=Elite">Request an Elite upgrade →</a></div>;
  if(account.plan!=='Free' || paused) return null;
  if(account.elite_trial_started_at) return <p className="trial-used-note">Your one-time Elite trial has been used. Request an upgrade to get Elite benefits again.</p>;
  return <div className="elite-trial-card"><div><strong><Sparkles size={19}/> Try Elite free for 15 days</strong><p>5 playgrounds, unlimited runs, up to 5 managers per playground, and public shops and inquiries. Once per account. No payment required; returns to Free automatically.</p></div><button type="button" className="lm-button" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');
    try {const response=await fetch('/api/account/trial?action=start',{method:'POST'});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error??'Could not start the trial.');await onStarted();window.dispatchEvent(new Event('naol-trial-changed'));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }}>{busy?'Starting trial…':'Start my free Elite trial'}</button>{error&&<p role="alert">{error}</p>}</div>;
}

export function TrialExpiryNotice() {
  const client=useAccountAuth();
  const [open,setOpen]=useState(false);
  const checking=useRef(false);
  useEffect(()=>{
    let alive=true;
    const check=async()=>{
      if(checking.current || document.visibilityState==='hidden') return;
      checking.current=true;
      try {
        const {data}=await client.auth.getSession();
        if(!data.session || !alive) return;
        const response=await fetch('/api/account/trial?action=notice',{method:'POST'});
        if(response.ok){const notice=await response.json() as {expired:boolean};if(alive && notice.expired){setOpen(true);window.dispatchEvent(new Event('naol-trial-changed'));}}
      } catch {} finally {checking.current=false;}
    };
    void check();
    const interval=window.setInterval(()=>void check(),60000);
    const refresh=()=>void check();
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{window.setTimeout(refresh,0);});
    return()=>{alive=false;window.clearInterval(interval);subscription.unsubscribe();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[client]);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay"/><Dialog.Content className="plan-request-dialog"><Dialog.Title>Your Elite trial has ended</Dialog.Title><Dialog.Description>Your 15-day trial is complete and your account is back on Free. All playgrounds, runs and loot records are retained. Free limits now apply to new activity.</Dialog.Description><p>Want to keep Elite benefits? Request an upgrade and the administrator will help you.</p><div className="plan-request-actions"><Dialog.Close asChild><button type="button">Got it</button></Dialog.Close><a className="lm-button" href="/contact?request=plan&plan=Elite" onClick={()=>setOpen(false)}>Request Elite upgrade</a></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
