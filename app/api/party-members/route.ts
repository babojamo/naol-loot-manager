import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {api,ApiError,guildContext,json,tokenHash} from '../../../lib/tenant';
import {database} from '../../../lib/supabase-store';
import {parsePartyResponse,partyRequest,type PartyResult} from '../../../lib/party-ai';

export async function POST(request:Request){return api(async()=>{
  const {user,guild}=await guildContext(request);
  if(!['owner','manager'].includes(guild.role??''))throw new ApiError(403,'Only playground managers can read screenshots.');
  const key=env.OPENAI_API_KEY;
  if(!key)throw new ApiError(503,'AI screenshot reading is not configured yet. You can add members manually.');
  if(Number(request.headers.get('content-length')??0)>1500000)throw new ApiError(413,'Crop the screenshot to the party list before uploading.');
  // Bound the streamed body before parsing; clients cannot bypass limits by omitting Content-Length.
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Choose a screenshot.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw new ApiError(413,'Crop the screenshot to the party list before uploading.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'Invalid screenshot request.');}
  const parsed=z.object({image:z.string().max(1400000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)}).safeParse(body);
  if(!parsed.success)throw new ApiError(400,'Choose a valid party screenshot.');
  const raw=atob(parsed.data.image.split(',')[1]);const data=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const signature=[137,80,78,71,13,10,26,10];
  if(data.length<24||!signature.every((v,i)=>data[i]===v))throw new ApiError(400,'Invalid PNG screenshot.');
  const view=new DataView(data.buffer),width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||Math.max(width,height)>1600||width*height>1050000)throw new ApiError(413,'Crop the screenshot to the party list before uploading.');
  const claim=await database<{id?:string;claimId?:string;cached?:PartyResult}>('party_read_claim',user,guild.id,{hash:await tokenHash(parsed.data.image)});
  if(claim.cached)return json({...claim.cached,cached:true});
  if(!claim.id||!claim.claimId)throw new ApiError(503,'Run migration 008 to enable the AI screenshot budget.');
  let result:PartyResult;
  try{
    // One request only; no automatic retry or upgrade to a more expensive model.
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(partyRequest(parsed.data.image)),signal:AbortSignal.timeout(45000)});
    if(!response.ok){if(response.status===429)throw new ApiError(503,'The AI reader has reached its usage limit. Try later or add names manually.');if(response.status===401||response.status===403)throw new ApiError(503,'The AI reader key or model access needs attention. Please contact the administrator.');throw new ApiError(502,'The AI reader could not read this image. Try a cropped screenshot or enter names manually.');}
    try{result=parsePartyResponse(await response.json());}catch{throw new ApiError(502,'No reliable party reading was returned. Try a cropped screenshot or add names manually.');}
  }catch(e){if(e instanceof ApiError)throw e;throw new ApiError(504,'The AI reader timed out. Add names manually or try again later.');}
  await database('party_read_finish',user,guild.id,{id:claim.id,claimId:claim.claimId,result});
  return json({...result,cached:false});
},request);}
