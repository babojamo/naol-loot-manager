"use client";
import {useState} from 'react';
import {authContinuation} from '../../lib/auth-continuation';
import {Mail} from 'lucide-react';
import {useAccountAuth,useImpersonating} from './account-session';
export function EmailVerification({email,returnTo='/playgrounds'}:{email:string;returnTo?:string}){
  const client=useAccountAuth(),impersonating=useImpersonating();const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[sent,setSent]=useState(false);
  if(impersonating)return null;
  return <aside className="verification-notice" role="status"><Mail size={22}/><div><strong>Verify your email address</strong><p>You can use your playgrounds now. Verify {email} to confirm it belongs to you.</p>{message&&<p>{message}</p>}</div><button className="lm-button secondary-lm" disabled={busy||sent} onClick={async()=>{setBusy(true);try{document.cookie=`naol_verification_next=${encodeURIComponent(authContinuation(returnTo))}; Path=/auth/callback; Max-Age=604800; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:new URL('/auth/callback',window.location.origin).href}});if(error)throw error;setSent(true);setMessage('Check your email and open the verification link in this browser.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>{busy?'Sending…':sent?'Email sent':'Send verification email'}</button></aside>;
}
