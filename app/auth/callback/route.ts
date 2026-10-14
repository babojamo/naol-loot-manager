import {authContinuation} from '../../../lib/auth-continuation';
import {serverAuth} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
import {cookies} from 'next/headers';
import {env} from 'cloudflare:workers';
import {createRecoveryGrant,recoveryCookie,recoverySeconds} from '../../../lib/password-recovery';
export async function GET(request:Request){
  const url=new URL(request.url),code=url.searchParams.get('code');
  let next='/playgrounds';try{next=authContinuation(decodeURIComponent(request.headers.get('cookie')?.match(/(?:^|;\s*)naol_verification_next=([^;]+)/)?.[1]??''));}catch{}
  const verifiedRedirect=()=>new Response(null,{status:303,headers:{Location:new URL(next,url).href,'Set-Cookie':'naol_verification_next=; Path=/auth/callback; Max-Age=0; SameSite=Lax'}});
  if(code){const client=await serverAuth();const flowId=url.searchParams.get('sb_flow_id');const {data,error}=await client.auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);if(!error&&data.user?.email){const user=data.user;
    if('redirectType' in data&&data.redirectType==='recovery'&&data.session){
      const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
      if(!secret)return Response.redirect(new URL('/forgot-password?error=link',url),303);
      try{await database('account',{userId:user.id,email:user.email!,displayName:user.user_metadata?.name||user.email!,fullName:user.user_metadata?.name??null});}
      catch{await client.auth.signOut({scope:'local'});return Response.redirect(new URL('/forgot-password?error=account',url),303);}
      (await cookies()).set(recoveryCookie,await createRecoveryGrant(secret,user.id,data.session.access_token),{path:'/',httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:recoverySeconds});
      return new Response(null,{status:303,headers:{Location:new URL('/reset-password',url).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    try{await database('email_verify',{userId:user.id,email:user.email!,displayName:user.user_metadata?.name||user.email!,fullName:user.user_metadata?.name??null});return verifiedRedirect();}catch{return Response.redirect(new URL('/playgrounds?verification=retry',url),303);}}}
  return Response.redirect(new URL('/login?confirmation=failed',url),303);
}
