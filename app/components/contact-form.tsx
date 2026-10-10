"use client";
import {useState} from 'react';
import {Send} from 'lucide-react';
export function ContactForm({initialEmail,initialSubject,initialMessage=''}:{initialEmail:string;initialSubject:string;initialMessage?:string}){
  const [email,setEmail]=useState(initialEmail),[subject,setSubject]=useState(initialSubject),[message,setMessage]=useState(initialMessage),[website,setWebsite]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[sent,setSent]=useState(false),[requestId,setRequestId]=useState('');
  function changed(){setRequestId('');setSent(false);setNotice('');}
  return <div className="portal-card contact-card"><h2>Contact us</h2><p>We’ll reply to your email address.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setNotice('');setSent(false);const id=requestId||crypto.randomUUID();setRequestId(id);try{const r=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,subject,message,website,requestId:id})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Could not send your message.');setSent(true);setNotice('Your message has been sent to the platform administrator.');setMessage('');setRequestId('');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}}>
    <label>Email address<input required type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={e=>{changed();setEmail(e.target.value);}}/></label>
    <label>Subject<input required minLength={2} maxLength={160} value={subject} disabled={busy} onChange={e=>{changed();setSubject(e.target.value);}}/></label>
    <label>Message<textarea required minLength={10} maxLength={5000} value={message} disabled={busy} onChange={e=>{changed();setMessage(e.target.value);}}/><small>10–5,000 characters. Please don’t include passwords or secret keys.</small></label>
    <label className="contact-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
    {notice&&<p className="portal-alert" role={sent?'status':'alert'}>{notice}</p>}<button className="lm-button" disabled={busy}><Send size={17}/>{busy?'Sending…':'Send message'}</button>
  </form></div>;
}
