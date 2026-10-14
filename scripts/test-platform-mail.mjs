process.on('uncaughtException',e=>{console.error({message:e.message,code:e.code,position:e.position,where:e.where});process.exit(1);});
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,encrypted_password text);`);
const files=(await readdir(new URL('../supabase/',import.meta.url))).filter(f=>/^0\d\d_.*\.sql$/.test(f)).sort();
for(const f of files){let sql=await readFile(new URL('../supabase/'+f,import.meta.url),'utf8');if(f.startsWith('020_'))sql=sql.replace(/^create extension if not exists pg_cron.*$/m,'').replace(/^select cron.schedule.*$/m,'');await db.exec(sql);}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [admin,alice,bob,charlie]=[1,2,3,4].map(n=>({id:id(n),email:n===1?'kevin.loquencio@gmail.com':`user${n}@example.com`,name:`User ${n}`}));
for(const u of [admin,alice,bob,charlie])await db.query('insert into auth.users values($1,$2,now(),$3,null)',[u.id,u.email,JSON.stringify({name:u.name,username:`user${u.id.slice(-1)}`})]);
await db.exec(`update public.loot_manager_accounts set platform_admin=true,email_verified=true where id='${admin.id}';set role service_role;`);
const op=async(name,user,guild,data={})=>(await db.query('select public.loot_manager_operation($1,$2::jsonb,$3::uuid,$4::jsonb) result',[name,user?JSON.stringify(user):null,guild??null,JSON.stringify(data)])).rows[0].result;
const blank={members:[],runs:[],sales:[],vendingPrices:{},lootImages:{},payoutQueue:[],auditLog:[]};
for(const [u,n] of [[alice,100],[bob,101]])assert.ok(!(await op('guild_create',u,null,{id:id(n),name:`Playground ${n}`,slug:`playground-${n}`,isPublic:false,state:blank}))._error);

const {transpileModule}=await import('typescript');
const source=await readFile(new URL('../lib/platform-mail.ts',import.meta.url),'utf8');const {mailText,mailSubject,mailPayload,deliverMailBatch}=await import('data:text/javascript;base64,'+Buffer.from(transpileModule(source,{compilerOptions:{module:99,target:99}}).outputText).toString('base64'));
const err=(v,status)=>assert.equal(v._error?.status,status,JSON.stringify(v));
const update={userId:alice.id,plan:'Elite',banned:false,overrides:{}};
err(await op('platform_update',bob,null,update),403);
const changed=await op('platform_update',admin,null,update);assert.ok(changed.mailJobId,JSON.stringify(changed));
const upgrade=await op('platform_mail_get',admin,null,{id:changed.mailJobId});assert.equal(upgrade.oldPlan,'Free');assert.equal(upgrade.newPlan,'Elite');assert.equal(upgrade.status,'pending');assert.equal(upgrade.recipients[0].email,alice.email);assert.match(mailText(upgrade,'Alice'),/Thank you/);assert.match(mailSubject(upgrade),/upgraded to Elite/);
assert.equal((await op('platform_update',admin,null,{...update,discordOverride:true})).mailJobId,undefined);
assert.equal((await op('platform_mail_list',admin)).total,1);
const down=await op('platform_update',admin,null,{...update,plan:'Free'});const downgrade=await op('platform_mail_get',admin,null,{id:down.mailJobId});assert.match(mailText(downgrade,'Alice'),/sorry/);assert.match(mailText(downgrade,'Alice'),/valued part/);
const requestId=id(900),create={requestId,userIds:[bob.id,alice.id,alice.id],subject:'Hello community',message:'Thank you for being part of NAOL.'};
for(const name of ['platform_mail_list','platform_mail_get','platform_mail_recipient','platform_mail_create','platform_mail_claim','platform_mail_ack'])err(await op(name,bob,null,{...create,id:changed.mailJobId,userId:alice.id}),403);
const manual=await op('platform_mail_create',admin,null,create);assert.equal(manual.id,requestId,JSON.stringify(manual));assert.equal((await op('platform_mail_create',admin,null,create)).id,requestId);
err(await op('platform_mail_create',admin,null,{...create,message:'A changed message'}),409);
err(await op('platform_mail_create',admin,null,{...create,requestId:id(901),userIds:[id(999)]}),400);
err(await op('platform_mail_create',admin,null,{...create,requestId:id(901),userIds:[]}),400);
err(await op('platform_mail_create',admin,null,{...create,requestId:id(901),subject:'Injected'+String.fromCharCode(10)+'header'}),400);
const job=await op('platform_mail_get',admin,null,{id:manual.id});assert.equal(job.recipients.length,2);assert.equal((await op('platform_mail_list',admin)).total,3);
const payload=mailPayload(job,'NAOL <hello@example.com>');assert.equal(payload.length,2);for(const p of payload){assert.equal(p.to.length,1);assert.equal(p.reply_to,'kevin.loquencio@gmail.com');assert.ok(!('bcc'in p));}
const escaped=mailPayload({...job,message:'<script>danger()</script>',subject:'<b>Title</b>'},'sender')[0];assert.ok(!escaped.html.includes('<script>'));assert.match(escaped.html,/&lt;script&gt;/);assert.match(escaped.html,/&lt;b&gt;/);
err(await op('platform_mail_claim',admin,null,{id:job.id,payload:payload.map(p=>({...p,to:['outside@example.com']}))}),400);
const claim=await op('platform_mail_claim',admin,null,{id:job.id,payload});assert.ok(claim.token,JSON.stringify(claim));assert.deepEqual(claim.payload,payload);
err(await op('platform_mail_claim',admin,null,{id:job.id,payload}),409);
let observed;
const accepted=await deliverMailBatch(job.id,claim.payload,'test-only-key',async(url,init)=>{observed={url,init};return Response.json({data:[{id:'provider-one'},{id:'provider-two'}]});});assert.equal(accepted.status,'accepted');assert.equal(observed.init.headers['Idempotency-Key'],'naol-platform-mail-'+job.id);assert.deepEqual(JSON.parse(observed.init.body),payload);
err(await op('platform_mail_ack',admin,null,{id:job.id,token:id(999),...accepted}),409);
assert.ok((await op('platform_mail_ack',admin,null,{id:job.id,token:claim.token,...accepted})).ok);
assert.equal((await op('platform_mail_get',admin,null,{id:job.id})).recipients[0].providerId,'provider-one');assert.equal((await op('platform_mail_claim',admin,null,{id:job.id,payload})).done,true);
const upgradePayload=mailPayload(upgrade,'original-sender@example.com');let attempt=await op('platform_mail_claim',admin,null,{id:upgrade.id,payload:upgradePayload});assert.ok(attempt.token);
const uncertain=await deliverMailBatch(upgrade.id,attempt.payload,'test-only-key',async()=>{throw Error('network timeout');});assert.equal(uncertain.status,'unconfirmed');await op('platform_mail_ack',admin,null,{id:upgrade.id,token:attempt.token,...uncertain});
attempt=await op('platform_mail_claim',admin,null,{id:upgrade.id,payload:mailPayload(upgrade,'changed-sender@example.com')});assert.deepEqual(attempt.payload,upgradePayload); // Frozen payload and key protect retries.
await op('platform_mail_ack',admin,null,{id:upgrade.id,token:attempt.token,...uncertain});
await db.exec('reset role;');await db.query("update public.loot_manager_mail_jobs set first_attempt_at=now()-interval '24 hours' where id=$1",[upgrade.id]);await db.exec('set role service_role;');err(await op('platform_mail_claim',admin,null,{id:upgrade.id,payload:upgradePayload}),409);
const failed=await deliverMailBatch(job.id,payload,'test-only-key',async()=>Response.json({message:'Rate limited'},{status:429}));assert.equal(failed.status,'failed');
assert.equal((await deliverMailBatch(job.id,payload,'test-only-key',async()=>Response.json({message:'temporary error'},{status:500}))).status,'unconfirmed');
assert.equal((await deliverMailBatch(job.id,payload,'test-only-key',async()=>Response.json({data:[{id:'only-one'}]}))).status,'unconfirmed');
// Impersonation cannot access the mail tools or trigger plan changes.
const impersonation=await op('platform_impersonation_start',admin,null,{userId:alice.id,tokenHash:'a'.repeat(64),sessionHash:'b'.repeat(64)});
const acting={...alice,impersonationId:impersonation.id,impersonatorId:admin.id,impersonationSessionHash:'b'.repeat(64)};
err(await op('platform_mail_list',acting),403);err(await op('platform_update',acting,null,{...update,plan:'Legend'}),403);
await db.exec('reset role;');await db.exec(await readFile(new URL('../supabase/025_platform_mail.sql',import.meta.url),'utf8'));await db.exec('set role authenticated;');
await assert.rejects(()=>db.query('select * from public.loot_manager_mail_jobs'));await assert.rejects(()=>db.query('select * from public.loot_manager_mail_recipients'));await assert.rejects(()=>op('platform_mail_list',admin));
await db.close();console.log('Plan mail enqueueing, admin permissions, private recipients, immutable batches, duplicate submissions, retry safety and message rendering passed. No real emails were sent.');
