import {cookies} from 'next/headers';
import {env} from 'cloudflare:workers';
import {serverAuth} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
import {impersonationCookie} from '../../../lib/impersonation';
import {createRecoveryGrant,recoveryCookie,recoverySeconds} from '../../../lib/password-recovery';

export const dynamic='force-dynamic';

// Only recovery tokens can grant access to the password-reset form. Never honor
// a caller-supplied destination or verification type here.
export async function GET(request:Request){
  const url=new URL(request.url);
  const go=(path:string)=>new Response(null,{status:303,headers:{Location:new URL(path,url.origin).href,'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});
  const token=url.searchParams.get('token_hash');
  if(url.searchParams.getAll('token_hash').length!==1||url.searchParams.getAll('type').length!==1||url.searchParams.get('type')!=='recovery'||!token||!/^[A-Za-z0-9_-]{40,256}$/.test(token))return go('/forgot-password?error=link');
  const store=await cookies();
  if(store.get(impersonationCookie)?.value)return go('/forgot-password?error=impersonation');
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)return go('/forgot-password?error=link');
  try{
    const client=await serverAuth();
    const {data,error}=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
    if(error||!data.user?.email||!data.session)return go('/forgot-password?error=link');
    const user=data.user;
    try{await database('account',{userId:user.id,email:user.email!,displayName:user.user_metadata?.name||user.email!,fullName:user.user_metadata?.name??null});}
    catch{await client.auth.signOut({scope:'local'});store.set(recoveryCookie,'',{path:'/',httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:0});return go('/forgot-password?error=account');}
    store.set(recoveryCookie,await createRecoveryGrant(secret,user.id,data.session.access_token),{path:'/',httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:recoverySeconds});
    return go('/reset-password');
  }catch{return go('/forgot-password?error=link');}
}
