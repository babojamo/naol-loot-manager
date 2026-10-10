export type DeliveryResult={success:boolean;error?:string;retrySeconds:number};
export async function deliverDiscord(url:string,content:string,send:typeof fetch=fetch):Promise<DeliveryResult>{
  if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url))return {success:false,error:'The saved webhook URL is invalid. Replace it in Discord settings.',retrySeconds:3600};
  const endpoint=new URL(url);endpoint.searchParams.set('wait','true');
  try{
    const response=await send(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','User-Agent':'DiscordBot (https://naol.lokwensio.com, 1.0)'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
    if(response.ok){await response.arrayBuffer();return {success:true,retrySeconds:0};}
    const body=await response.json().catch(()=>null) as {code?:number;retry_after?:number}|null;
    if(response.status===429){const delay=Number(response.headers.get('Retry-After')??body?.retry_after??60);return {success:false,error:'Discord rate-limited delivery. Messages are saved and will retry after the cooldown.',retrySeconds:Number.isFinite(delay)?Math.max(1,Math.min(86400,Math.ceil(delay))):60};}
    if(response.status===404)return {success:false,error:'Discord could not find this webhook. It may have been deleted; replace its URL.',retrySeconds:3600};
    if(response.status===401||response.status===403)return {success:false,error:`Discord rejected access (HTTP ${response.status}). Check the webhook and channel permissions.`,retrySeconds:3600};
    if(response.status===400)return {success:false,error:`Discord rejected the message (HTTP 400${body?.code?`, code ${body.code}`:''}). Check the webhook channel type.`,retrySeconds:300};
    return {success:false,error:`Discord delivery failed (HTTP ${response.status}). Messages remain saved for retry.`,retrySeconds:60};
  }catch{return {success:false,error:'Discord connection timed out or was unavailable. Messages remain saved for retry.',retrySeconds:60};}
}
