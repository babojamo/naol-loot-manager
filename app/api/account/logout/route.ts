import {cookies} from 'next/headers';
import {impersonationCookie} from '../../../../lib/impersonation';
import {endImpersonation} from '../../../../lib/impersonation-server';
import {serverAuth} from '../../../../lib/account-auth';
import {api,checkMutation,json} from '../../../../lib/tenant';
export async function POST(request:Request){return api(async()=>{checkMutation(request);if((await cookies()).get(impersonationCookie)?.value)return json({ok:true,impersonationEnded:true,next:await endImpersonation(request)});const auth=await serverAuth();await auth.auth.signOut();return json({ok:true},200,{'set-cookie':'loot_manager_guild=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'});},request);}
