import {cookies} from 'next/headers';
import {env} from 'cloudflare:workers';
import {serverAuth} from './account-auth';
import {recoveryCookie,verifyRecoveryGrant} from './password-recovery';
export async function recoverySession(){
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)return null;
  const client=await serverAuth();const {data:{user},error}=await client.auth.getUser();if(error||!user?.email)return null;
  const {data:{session}}=await client.auth.getSession();if(!session)return null;
  if(!await verifyRecoveryGrant((await cookies()).get(recoveryCookie)?.value,secret,user.id,session.access_token))return null;
  return {client,user:{userId:user.id,email:user.email,displayName:user.user_metadata?.name||user.email,fullName:user.user_metadata?.name??null}};
}
