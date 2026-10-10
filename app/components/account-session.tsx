"use client";
import {createBrowserClient} from '@supabase/ssr';
import {createContext,useContext,useEffect,useMemo} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
const AuthContext=createContext<SupabaseClient|null>(null);
export function AccountSession({url,keyValue,children}:{url:string;keyValue:string;children:React.ReactNode}){
  const client=useMemo(()=>createBrowserClient(url,keyValue),[url,keyValue]);
  useEffect(()=>{void client.auth.startAutoRefresh();return()=>{void client.auth.stopAutoRefresh();};},[client]);
  return <AuthContext.Provider value={client}>{children}</AuthContext.Provider>;
}
export function useAccountAuth(){const client=useContext(AuthContext);if(!client)throw new Error('Account authentication is unavailable.');return client;}
export function SignOutButton(){const client=useAccountAuth();return <button className="lm-text-link" onClick={async()=>{await client.auth.signOut();window.location.assign('/login');}}>Sign out ↗</button>;}
