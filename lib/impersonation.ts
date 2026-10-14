export const impersonationCookie='naol_impersonation';
export const impersonationSeconds=3600;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseImpersonation(value:string|undefined){
  if(!value||value.length!==101)return null;
  const [id,token]=value.split('.');
  return uuid.test(id)&&/^[a-f0-9]{64}$/.test(token)?{id,token}:null;
}
export function impersonationContext(value:string|undefined){return value?parseImpersonation(value)?.id??'invalid':'none';}
export function impersonationMutationContextMatches(value:string|undefined,header:string|null){return !value&&header===null||header===impersonationContext(value);}
export function newImpersonationToken(){return [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function impersonationHash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
// Read claims only after getUser(accessToken) has verified this exact access token.
export async function verifiedAuthSessionHash(accessToken:string,verifiedUserId:string){
  try{
    const part=accessToken.split('.')[1];if(!part||part.length>16384)return null;
    const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))) as {sub?:string;session_id?:string};
    return claims.sub===verifiedUserId&&typeof claims.session_id==='string'&&uuid.test(claims.session_id)?impersonationHash(claims.session_id):null;
  }catch{return null;}
}
