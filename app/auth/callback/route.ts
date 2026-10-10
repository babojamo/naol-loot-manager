import {serverAuth} from '../../../lib/account-auth';
import {database} from '../../../lib/supabase-store';
export async function GET(request:Request){
  const url=new URL(request.url),code=url.searchParams.get('code');
  if(code){const client=await serverAuth();const {data,error}=await client.auth.exchangeCodeForSession(code);if(!error&&data.user?.email){const user=data.user;try{await database('email_verify',{userId:user.id,email:user.email!,displayName:user.user_metadata?.name||user.email!,fullName:user.user_metadata?.name??null});return Response.redirect(new URL('/playgrounds',url),303);}catch{return Response.redirect(new URL('/playgrounds?verification=retry',url),303);}}}
  return Response.redirect(new URL('/login?confirmation=failed',url),303);
}
