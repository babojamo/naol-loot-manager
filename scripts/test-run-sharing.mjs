import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {authContinuation,authLink} from '../lib/auth-continuation.ts';
import {sendRunShareEmails} from '../lib/run-share-email.ts';
const compile=code=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const allocations=compile(await readFile('lib/sale-allocations.ts','utf8')),images=compile(await readFile('lib/loot-images.ts','utf8'));
const {projectSharedRun}=await import(compile((await readFile('lib/shared-run.ts','utf8')).replace("'./sale-allocations'",JSON.stringify(allocations)).replace("'./loot-images'",JSON.stringify(images))));
const token='a'.repeat(64),hash='b'.repeat(64),path='/shared-runs/'+token;
assert.equal(authContinuation(path),path);assert.equal(authLink('/register',path),'/register?next='+encodeURIComponent(path));
for(const invalid of ['//evil.test',path+'?next=https://evil.test','https://evil.test'+path,'/shared-runs/nope'])assert.equal(authContinuation(invalid),'/playgrounds');
const state={members:[{id:'p1',name:'Germi',active:true},{id:'p2',name:'Hidden Player',active:true}],runs:[
  {id:'r1',dungeon:'Ankou',createdAt:'2026-10-10T12:00:00Z',memberIds:['p1'],loots:[{id:'l1',name:'Sunstone',quantity:3}],createdBy:'Owner'},
  {id:'r2',dungeon:'Private dungeon',createdAt:'2026-10-10T13:00:00Z',memberIds:['p2'],loots:[{id:'l2',name:'Sunstone',quantity:5}]}],
  sales:[{id:'s1',lootName:'Sunstone',quantity:2,recipientIds:['p1'],allocations:[{runLootId:'l1',quantity:2}],createdAt:'2026-10-11T00:00:00Z',unitPrice:100,total:200,salaryEach:200}],vendingPrices:{SUNSTONE:80000000},lootImages:{sunstone:'data:image/png;base64,AAAA'},auditLog:[{action:'Private log'}],payoutQueue:['p2']};
const projected=projectSharedRun({guild:{name:'Test'},runId:'r1',state,restricted:false});
assert.deepEqual(projected.members,['Germi']);assert.equal(projected.loots[0].sold,2);assert.equal(projected.loots[0].available,1);assert.equal(projected.loots[0].vendingPrice,80000000);assert.equal(projected.loots[0].image,state.lootImages.sunstone);
for(const hidden of ['Hidden Player','Private dungeon','auditLog','payoutQueue','salaryEach','recipientIds'])assert.ok(!JSON.stringify(projected).includes(hidden));
const legacy=structuredClone(state);legacy.sales[0].allocations=[{runLootId:'l2',quantity:2}];assert.equal(projectSharedRun({guild:{name:'Test'},runId:'r1',state:legacy}).loots[0].sold,2);
const sample={key:'test',from:'NAOL <mail@example.com>',emails:['guest@example.com','friend@example.com'],playground:'Test',dungeon:'Ankou',inviter:'Owner',token,revision:1};
assert.deepEqual(await sendRunShareEmails(sample,async(url,init)=>{assert.equal(url,'https://api.resend.com/emails/batch');const body=JSON.parse(init.body);assert.deepEqual(body.map(m=>m.to),[['friend@example.com'],['guest@example.com']]);assert.ok(body.every(m=>m.text.includes('https://naol.lokwensio.com'+path)));assert.ok(init.headers['Idempotency-Key'].length<256);return new Response('{"data":[{"id":"sent1"},{"id":"sent2"}]}');}),[]);
assert.deepEqual(await sendRunShareEmails(sample,async()=>new Response('{}',{status:422})),[...sample.emails].sort());
assert.deepEqual(await sendRunShareEmails(sample,async()=>new Response('{"data":[{"id":"sent"},{}]}')),['guest@example.com']);
const db=new PGlite();
try{
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);');
const files=(await readdir('supabase')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort();
for(const file of files){await db.exec(await readFile('supabase/'+file,'utf8'));if(file.startsWith('016_'))await db.exec(await readFile('supabase/'+file,'utf8'));}
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner={id:uuid(1),email:'owner@example.com'},manager={id:uuid(2),email:'manager@example.com'},guest={id:uuid(3),email:'guest@example.com'},outsider={id:uuid(4),email:'outsider@example.com'},guild=uuid(10),otherGuild=uuid(11);
for(const [i,u]of [owner,manager,guest,outsider].entries())await db.query('insert into auth.users values($1,$2,now(),$3)',[u.id,u.email,JSON.stringify({name:'Test User',username:`sharing${i}`,email_verification_pending:true})]);
await db.query("insert into public.loot_manager_guilds(id,name,slug) values($1,'Test','test'),($2,'Other','other')",[guild,otherGuild]);
await db.query("insert into public.loot_manager_guild_users(guild_id,user_id,role) values($1,$2,'owner'),($1,$3,'manager'),($4,$5,'owner')",[guild,owner.id,manager.id,otherGuild,outsider.id]);
for(const id of [guild,otherGuild])await db.query('insert into public.loot_manager_ledgers(guild_id,payload) values($1,$2)',[id,JSON.stringify(state)]);
await db.exec('set role service_role');
const op=async(operation,user=owner,data={},guildId=guild)=>(await db.query('select public.loot_manager_operation($1,$2::jsonb,$3,$4::jsonb) result',[operation,user?JSON.stringify(user):null,guildId,JSON.stringify(data)])).rows[0].result;
const save={runId:'r1',mode:'public',emails:[],revision:0,token,tokenHash:hash};
assert.equal((await op('run_share_save',outsider,save))._error.status,403);
assert.equal((await op('run_share_save',owner,{...save,runId:'nonexistent'}))._error.status,404);
assert.equal((await op('run_share_get',manager,{runId:'r1'})).share,null);
const created=await op('run_share_save',manager,save);assert.equal(created.share.token,token);
assert.equal((await op('run_share_view',null,{tokenHash:hash},null)).runId,'r1');
assert.equal((await op('run_share_preview',null,{tokenHash:hash},null)).state.runs[0].dungeon,'Ankou');
const restricted=await op('run_share_save',owner,{...save,mode:'restricted',emails:['Guest@EXAMPLE.com'],revision:1});
assert.equal(restricted.share.token,token);assert.deepEqual(restricted.notifyEmails,['guest@example.com']);
assert.deepEqual(await op('run_share_preview',guest,{tokenHash:hash},null),{restricted:true});
assert.equal((await op('run_share_view',null,{tokenHash:hash},null))._error.status,401);
assert.equal((await op('run_share_view',owner,{tokenHash:hash},null))._error.status,403);
assert.match((await op('run_share_view',guest,{tokenHash:hash},null))._error.message,/Verify your email/);
await db.query('update public.loot_manager_accounts set email_verified=true where id=$1',[guest.id]);
assert.equal((await op('run_share_view',guest,{tokenHash:hash},null)).runId,'r1');
assert.equal((await op('run_share_save',owner,{...save,revision:1}))._error.status,409);
const repeat=await op('run_share_save',owner,{...save,mode:'restricted',emails:[guest.email],revision:2});assert.deepEqual(repeat.notifyEmails,[]);
const publicAgain=await op('run_share_save',owner,{...save,revision:3});assert.equal(publicAgain.share.token,token);
assert.equal((await op('run_share_view',null,{tokenHash:hash},null)).runId,'r1');
await op('run_share_save',owner,{...save,mode:'restricted',emails:[outsider.email],revision:4});assert.equal((await op('run_share_view',guest,{tokenHash:hash},null))._error.status,403);
await op('run_share_save',owner,{...save,mode:'disabled',revision:5});assert.equal((await op('run_share_view',null,{tokenHash:hash},null))._error.status,404);
await op('run_share_save',owner,{...save,revision:6});
await db.query('update public.loot_manager_accounts set banned=true where id=$1',[owner.id]);assert.equal((await op('run_share_view',null,{tokenHash:hash},null))._error.status,404);
await db.query('update public.loot_manager_accounts set banned=false where id=$1',[owner.id]);
await db.query("update public.loot_manager_ledgers set payload=jsonb_set(payload,'{runs}','[]') where guild_id=$1",[guild]);assert.equal((await op('run_share_view',null,{tokenHash:hash},null))._error.status,404);
await db.query('delete from public.loot_manager_guilds where id=$1',[guild]);assert.equal((await db.query('select count(*)::int n from public.loot_manager_run_shares where guild_id=$1',[guild])).rows[0].n,0);
await db.exec('reset role;set role authenticated');await assert.rejects(()=>op('run_share_view',guest,{tokenHash:hash}),/permission denied/);await assert.rejects(()=>db.query('select * from public.loot_manager_run_shares'),/permission denied/);
console.log('PASS: permanent links, public/private access, verified-email guard, tenant isolation, mode changes, revocation, deletion, private previews, run-only projection, legacy sales and email delivery.');
}finally{await db.close();}
