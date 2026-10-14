import {createClient} from '@supabase/supabase-js';
import {env} from 'cloudflare:workers';
import type {SupporterBadge} from './support';
// Called only after validating the signed-in account. No browser-supplied account ID is accepted.
export async function accountRecognition(account:{id:string;plan:string}):Promise<SupporterBadge|null>{
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret||!env.NEXT_PUBLIC_SUPABASE_URL)return null;
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {data,error}=await client.from('loot_manager_supporters').select('badge,sidebar_badge_enabled').eq('user_id',account.id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if(error)return null;
    return data?.sidebar_badge_enabled===true&&['Supporter','Elite Supporter','Legend Supporter'].includes(data.badge)?data.badge as SupporterBadge:null;
  }catch{return null;}
}
