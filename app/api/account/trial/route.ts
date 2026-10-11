import {api,checkMutation,identity,json,ApiError} from '../../../../lib/tenant';
import {database} from '../../../../lib/supabase-store';
export async function POST(request:Request) {
  return api(async()=>{
    checkMutation(request);
    const user=await identity();
    const action=new URL(request.url).searchParams.get('action');
    if(action!=='start' && action!=='notice') throw new ApiError(400,'Choose a valid trial action.');
    return json(await database(action==='start'?'elite_trial_start':'elite_trial_notice',user));
  },request);
}
