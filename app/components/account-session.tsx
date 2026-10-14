"use client";
import {ImpersonationBanner,notifyAccountContextChange} from './impersonation-banner';
import {createBrowserClient} from '@supabase/ssr';
import {createContext,useContext,useEffect,useMemo} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
const ImpersonatingContext=createContext(false);
export function useImpersonating(){return useContext(ImpersonatingContext);}
const AuthContext=createContext<SupabaseClient|null>(null);
export function AccountSession({url,keyValue,children,initialContext}:{url:string;keyValue:string;children:React.ReactNode;initialContext:string}){
  const client=useMemo(()=>createBrowserClient(url,keyValue),[url,keyValue]);
  useEffect(()=>{void client.auth.startAutoRefresh();return()=>{void client.auth.stopAutoRefresh();};},[client]);
  useEffect(()=>{
    const original=window.fetch;
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,window.location.href);
      const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      if(url.origin===window.location.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)){
        const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));headers.set('X-NAOL-Context',initialContext);
        return original(input,{...init,headers});
      }
      return original(input,init);
    };
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('naol-account-context'):null;
    if(channel)channel.onmessage=()=>window.location.reload();
    return()=>{window.fetch=original;channel?.close();};
  },[initialContext]);
  return <AuthContext.Provider value={client}><ImpersonatingContext.Provider value={initialContext!=='none'}><ImpersonationBanner enabled={initialContext!=='none'}/>{children}</ImpersonatingContext.Provider></AuthContext.Provider>;
}
export function useAccountAuth(){const client=useContext(AuthContext);if(!client)throw new Error('Account authentication is unavailable.');return client;}
export function SignOutButton(){const client=useAccountAuth(),impersonating=useImpersonating();return <button className="lm-text-link" onClick={async()=>{const response=await fetch('/api/account/logout',{method:'POST'});if(!response.ok)return;const data=await response.json() as {impersonationEnded?:boolean;next?:string};if(!data.impersonationEnded)await client.auth.signOut();notifyAccountContextChange();window.location.assign(data.next||'/login');}}>{impersonating?'Exit impersonation':'Sign out ↗'}</button>;}
