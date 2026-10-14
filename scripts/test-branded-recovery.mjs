import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const load=source=>import('data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64'));
const recovery=await load(await readFile(new URL('../lib/password-recovery.ts',import.meta.url),'utf8'));
let state;
globalThis.__recoveryTest={cookies:async()=>({get:name=>state.cookies.get(name),set:(name,value,options)=>state.saved.push({name,value,options})}),env:{SUPABASE_SECRET_KEY:'mock-secret'},serverAuth:async()=>({auth:{verifyOtp:async input=>{state.calls.push(input);if(state.verifyError)return {data:{},error:new Error('Expired')};return {data:{user:{id:'user-a',email:'player@example.com',user_metadata:{}},session:{access_token:'verified-recovery-session'}},error:null};},signOut:async()=>{state.signedOut=true;}}}),database:async()=>{if(state.blocked)throw new Error('Inactive account');},impersonationCookie:'naol_impersonation',...recovery};
let source=await readFile(new URL('../app/auth/confirm/route.ts',import.meta.url),'utf8');
source=source.replace(/^import .*;\r?\n/gm,'');
const {GET}=await load('const {cookies,env,serverAuth,database,impersonationCookie,createRecoveryGrant,recoveryCookie,recoverySeconds}=globalThis.__recoveryTest;\n'+source);
const token='pkce_'+'a'.repeat(56),base='https://naol.lokwensio.com/auth/confirm';
const reset=()=>{state={cookies:new Map(),saved:[],calls:[],blocked:false,verifyError:false,signedOut:false};globalThis.__recoveryTest.env.SUPABASE_SECRET_KEY='mock-secret';};
async function call(query){return GET(new Request(base+query));}
reset();let response=await call('?token_hash='+token+'&type=recovery&next=https://evil.invalid');
assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://naol.lokwensio.com/reset-password');
assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('cache-control'),/no-store/);
assert.deepEqual(state.calls,[{token_hash:token,type:'recovery'}]);
const proof=state.saved.find(c=>c.name===recovery.recoveryCookie);assert.ok(proof);assert.equal(proof.options.httpOnly,true);assert.equal(proof.options.secure,true);assert.equal(proof.options.sameSite,'lax');assert.equal(proof.options.maxAge,900);
assert.equal(await recovery.verifyRecoveryGrant(proof.value,'mock-secret','user-a','verified-recovery-session'),true);
assert.equal(await recovery.verifyRecoveryGrant(proof.value,'mock-secret','user-a','ordinary-session'),false);
for(const query of ['', '?type=recovery','?token_hash=invalid&type=recovery','?token_hash='+token+'&type=signup','?token_hash='+token+'&type=recovery&type=signup','?token_hash='+token+'&token_hash='+token+'&type=recovery']){
  reset();response=await call(query);assert.equal(response.headers.get('location'),'https://naol.lokwensio.com/forgot-password?error=link');assert.equal(state.calls.length,0);assert.equal(state.saved.length,0);
}
reset();state.verifyError=true;response=await call('?token_hash='+token+'&type=recovery');assert.match(response.headers.get('location'),/error=link$/);assert.equal(state.saved.length,0);
reset();state.blocked=true;response=await call('?token_hash='+token+'&type=recovery');assert.match(response.headers.get('location'),/error=account$/);assert.equal(state.signedOut,true);assert.equal(state.saved[0].options.maxAge,0);
reset();state.cookies.set('naol_impersonation',{value:'active'});response=await call('?token_hash='+token+'&type=recovery');assert.match(response.headers.get('location'),/error=impersonation$/);assert.equal(state.calls.length,0);
reset();globalThis.__recoveryTest.env.SUPABASE_SECRET_KEY='';response=await call('?token_hash='+token+'&type=recovery');assert.match(response.headers.get('location'),/error=link$/);assert.equal(state.calls.length,0);
delete globalThis.__recoveryTest;
console.log('PASS: branded recovery verifies only recovery tokens, binds the recovery grant, blocks impersonation/inactive accounts, strips tokens from redirects and rejects invalid links. No live Auth calls or emails.');
