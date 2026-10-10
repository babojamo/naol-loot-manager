import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../lib/discord-delivery.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-22',script:js+`
export default {async fetch(){
  const result=await deliverDiscord('https://discord.com/api/webhooks/123/test','Fixture',async(url,init)=>{
    const request=new Request(url,init); // Validates real workerd Request options without sending a message.
    if(request.redirect!=='manual'||!request.headers.get('User-Agent')||!request.url.endsWith('?wait=true'))throw Error('Invalid request');
    return new Response('{}',{status:200});
  });return Response.json(result);
}};`});
try{assert.equal((await(await mf.dispatchFetch('http://localhost')).json()).success,true);console.log('PASS: Discord request options accepted by the real Workers runtime; no external message sent.');}finally{await mf.dispose();}
