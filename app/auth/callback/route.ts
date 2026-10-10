import {serverAuth} from '../../../lib/account-auth';
export async function GET(request:Request){
  const url=new URL(request.url),code=url.searchParams.get('code');
  if(code){const client=await serverAuth();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return Response.redirect(new URL('/playgrounds',url),303);}
  return Response.redirect(new URL('/login?confirmation=failed',url),303);
}
