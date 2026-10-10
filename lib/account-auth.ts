import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {env} from 'cloudflare:workers';
export type AccountUser={userId:string;email:string;displayName:string;fullName:string|null};
export function authConfig(){
  const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error('Supabase authentication is not configured.');
  return {url,key};
}
export async function serverAuth(){
  const config=authConfig(),store=await cookies();
  return createServerClient(config.url,config.key,{
    cookies:{getAll:()=>store.getAll(),setAll:(items)=>{
      try{items.forEach(({name,value,options})=>store.set(name,value,options));}
      catch{/* The browser client persists refreshed sessions. */}
    }},
  });
}
export async function getAccountUser():Promise<AccountUser|null>{
  const client=await serverAuth();const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.email)return null;
  return {userId:user.id,email:user.email,displayName:user.user_metadata?.name||user.email,fullName:user.user_metadata?.name??null};
}
export async function requireAccountUser(next?:string){const user=await getAccountUser();if(!user)redirect(next?`/login?next=${encodeURIComponent(next)}`:'/login');return user;}
