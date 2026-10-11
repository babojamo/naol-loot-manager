"use client";
import {useEffect,useState} from 'react';
import {Dialog} from 'radix-ui';
import {Check,Copy,ExternalLink,Globe,LoaderCircle,Share2,ShieldCheck,X} from 'lucide-react';
import {StyledSelect} from './styled-select';
import type {DungeonRun} from '../../lib/types';
import type {RunShare} from '../api/run-sharing/route';

export function RunShareButton({run,guildId}:{run:DungeonRun;guildId:string}){
  const [open,setOpen]=useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className="icon-button" aria-label={`Share ${run.dungeon}`} title="Share run"><Share2 size={16}/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="admin-dialog-overlay"/><Dialog.Content className="plan-request-dialog run-share-dialog"><div className="plan-request-heading"><Dialog.Title>Share dungeon run</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="Close sharing"><X size={18}/></button></Dialog.Close></div><Dialog.Description>{run.dungeon} · Share the party, loot and current sale status.</Dialog.Description>{open&&<ShareEditor run={run} guildId={guildId}/>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
function ShareEditor({run,guildId}:{run:DungeonRun;guildId:string}){
  const [share,setShare]=useState<RunShare|null>(null),[mode,setMode]=useState<RunShare['mode']>('public'),[emails,setEmails]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{const controller=new AbortController();void(async()=>{try{
    const r=await fetch(`/api/run-sharing?runId=${encodeURIComponent(run.id)}`,{headers:{'X-Guild-ID':guildId},signal:controller.signal});
    const data=await r.json() as {share:RunShare|null;error?:string};if(!r.ok)throw Error(data.error||'Could not load sharing.');
    setShare(data.share);if(data.share){setMode(data.share.mode);setEmails(data.share.emails.join('\n'));}setLoaded(true);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[run.id,guildId]);
  const url=share?`https://naol.lokwensio.com/shared-runs/${share.token}`:'';
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
    const recipients=mode==='restricted'?[...new Set(emails.split(/[\s,;]+/).filter(Boolean).map(email=>email.toLowerCase()))]:[];
    const response=await fetch('/api/run-sharing',{method:'POST',headers:{'Content-Type':'application/json','X-Guild-ID':guildId},body:JSON.stringify({runId:run.id,mode,emails:recipients,revision:share?.revision??0})});
    const data=await response.json() as {share:RunShare;error?:string;emailed:number;failedEmails:string[]};if(!response.ok)throw Error(data.error||'Could not save sharing.');
    setShare(data.share);setMode(data.share.mode);setEmails(data.share.emails.join('\n'));
    setMessage(data.share.mode==='disabled'?'Sharing disabled. The link no longer grants access.':data.failedEmails?.length?`Sharing saved, but email delivery failed for ${data.failedEmails.join(', ')}. Copy the link to send it yourself.`:data.emailed?`Sharing saved. Invitations emailed to ${data.emailed} recipient${data.emailed===1?'':'s'}.`:'Sharing saved. Your link is ready.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(loading)return <p className="share-loading"><LoaderCircle size={18} className="spin"/>Loading sharing…</p>;
  return <form onSubmit={save} className="run-share-form">
    {error&&<p className="portal-alert" role="alert">{error}</p>}
    <label>Who can open this link?<StyledSelect aria-label="Run sharing access" disabled={!loaded||busy} value={mode} onChange={e=>{setMode(e.target.value as RunShare['mode']);setMessage('');}}><option value="public">Anyone with the link</option><option value="restricted">Specific email addresses</option><option value="disabled">Sharing disabled</option></StyledSelect></label>
    <p className="share-explanation">{mode==='public'?<><Globe size={16}/>Anyone with the link can view this run. Its social preview includes public run details.</>:mode==='restricted'?<><ShieldCheck size={16}/>Only the listed accounts can view it after verifying their email. Social previews keep run details private.</>:<>Access is disabled until you enable sharing again.</>}</p>
    {mode==='restricted'&&<label>Recipient email addresses<textarea required rows={4} maxLength={4100} value={emails} disabled={!loaded||busy} onChange={e=>{setEmails(e.target.value);setMessage('');}} placeholder={'player@example.com\nfriend@example.com'}/><small>Up to 20 addresses, separated by a new line or comma. New recipients receive the link by email when you save.</small></label>}
    {url&&<div className="share-link-box"><span>Permanent share link{share?.mode==='disabled'?' · disabled':''}</span><div><input readOnly aria-label="Permanent run share link" value={url} onFocus={e=>e.target.select()}/><button type="button" aria-label="Copy share link" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);}catch{setError('Select the link and copy it manually.');}}}>{copied?<Check size={17}/>:<Copy size={17}/>}</button></div>{share?.mode!=='disabled'&&<a href={url} target="_blank" rel="noopener noreferrer">Open shared run <ExternalLink size={13}/></a>}</div>}
    <p className="share-footnote">This link has no expiry. Saved access changes apply immediately. The page shows the latest loot status, images and vending prices.</p>
    {message&&<p className="share-result" role="status">{message}</p>}
    <div className="plan-request-actions"><Dialog.Close asChild><button type="button" disabled={busy}>Close</button></Dialog.Close><button className="lm-button" type="submit" disabled={!loaded||busy}>{busy?<><LoaderCircle size={16} className="spin"/>Saving…</>:share?'Save sharing':'Generate share link'}</button></div>
  </form>;
}
