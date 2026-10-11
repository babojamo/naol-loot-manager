import {authContinuation} from '../../../lib/auth-continuation';
import {serverAuth} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
export async function GET(request:Request){
  const url=new URL(request.url),code=url.searchParams.get('code');
  let next='/playgrounds';try{next=authContinuation(decodeURIComponent(request.headers.get('cookie')?.match(/(?:^|;\s*)naol_verification_next=([^;]+)/)?.[1]??''));}catch{}
  const verifiedRedirect=()=>new Response(null,{status:303,headers:{Location:new URL(next,url).href,'Set-Cookie':'naol_verification_next=; Path=/auth/callback; Max-Age=0; SameSite=Lax'}});
  if(code){const client=await serverAuth();const {data,error}=await client.auth.exchangeCodeForSession(code);if(!error&&data.user?.email){const user=data.user;try{await database('email_verify',{userId:user.id,email:user.email!,displayName:user.user_metadata?.name||user.email!,fullName:user.user_metadata?.name??null});return verifiedRedirect();}catch{return Response.redirect(new URL('/playgrounds?verification=retry',url),303);}}}
  return Response.redirect(new URL('/login?confirmation=failed',url),303);
}
