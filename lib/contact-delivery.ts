type Contact={key:string;from:string;email:string;subject:string;message:string;requestId:string;account?:string};
export async function sendContactEmail(data:Contact,send:typeof fetch=fetch):Promise<boolean>{
  try{
    const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${data.key}`,'Content-Type':'application/json','Idempotency-Key':`naol-contact-${data.requestId}`},body:JSON.stringify({from:data.from,to:['kevin.loquencio@gmail.com'],reply_to:data.email,subject:`[NAOL] ${data.subject}`,text:`From: ${data.email}\nSigned-in account: ${data.account??'Guest'}\n\n${data.message}`}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){console.error('Contact delivery failed',response.status);return false;}
    const result=await response.json() as {id?:string};return typeof result.id==='string'&&result.id.length>0;
  }catch{console.error('Contact delivery could not be confirmed');return false;}
}
