const encoder=new TextEncoder();
export const recoveryCookie='naol_password_recovery';
export const recoverySeconds=15*60;
function encode(value:Uint8Array){return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function key(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function sessionHash(token:string){return encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));}
export async function createRecoveryGrant(secret:string,userId:string,accessToken:string,now=Date.now()){
  const payload=encode(encoder.encode(JSON.stringify({userId,session:await sessionHash(accessToken),expires:now+recoverySeconds*1000})));
  const signature=await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyRecoveryGrant(grant:string|undefined,secret:string,userId:string,accessToken:string,now=Date.now()){
  if(!grant||grant.length>1024)return false;
  try{
    const [payload,signature,extra]=grant.split('.');if(!payload||!signature||extra)return false;
    if(!await crypto.subtle.verify('HMAC',await key(secret),decode(signature),encoder.encode(payload)))return false;
    const data=JSON.parse(new TextDecoder().decode(decode(payload))) as {userId?:string;session?:string;expires?:number};
    return data.userId===userId&&data.session===await sessionHash(accessToken)&&typeof data.expires==='number'&&data.expires>now&&data.expires<=now+recoverySeconds*1000;
  }catch{return false;}
}
