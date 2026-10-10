import type {LootState} from '../../../lib/types';
import {api,json,ApiError} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';
import {publicShopItems,type ShopPlayground} from '../../../lib/public-shop';
export async function GET(request:Request){return api(async()=>{
  const p=new URL(request.url).searchParams,slug=p.get('playground')??p.get('guild')??'';
  const rows=await database<Array<{guild:ShopPlayground;state:LootState}>>('public_shop',undefined,undefined,{slug});
  if(slug&&!rows.length)throw new ApiError(404,'This playground has not enabled its public shop.');
  return json({guilds:rows.map(r=>r.guild),guild:slug?rows[0]?.guild:null,items:rows.flatMap(r=>publicShopItems(r.state,r.guild))});
},request);}
