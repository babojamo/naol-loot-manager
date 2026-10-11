import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);');
for(const file of (await readdir('supabase')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await db.exec(await readFile('supabase/'+file,'utf8'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const users=[1,2,3,4,5,6].map(n=>({id:uuid(n),email:`trial${n}@example.com`}));
for(const [i,u]of users.entries())await db.query('insert into auth.users values($1,$2,now(),$3)',[u.id,u.email,JSON.stringify({name:'Trial User',username:`trial${i}`})]);
await db.query('update public.loot_manager_accounts set platform_admin=true where id=$1',[users[5].id]);
await db.query("update public.loot_manager_accounts set plan='Legend' where id=$1",[users[1].id]);
await db.query("update public.loot_manager_accounts set plan_paused=true where id=$1",[users[2].id]);
await db.query("update public.loot_manager_accounts set banned=true where id=$1",[users[3].id]);
await db.query("insert into public.loot_manager_guilds(id,name,slug,shop_enabled) values($1,'Trial playground','trial-playground',true)",[uuid(20)]);
await db.query("insert into public.loot_manager_guild_users values($1,$2,'owner',now())",[uuid(20),users[0].id]);
await db.query("insert into public.loot_manager_ledgers(guild_id,payload) values($1,$2)",[uuid(20),JSON.stringify({members:[],runs:[{loots:[{name:'Sunstone',quantity:12}]}],sales:[],auditLog:[]})]);
const op=async(operation,user=users[0],data={},guild=null)=>(await db.query('select public.loot_manager_operation($1,$2::jsonb,$3,$4::jsonb) result',[operation,user?JSON.stringify(user):null,guild,JSON.stringify(data)])).rows[0].result;
await db.exec('set role service_role');
const started=await op('elite_trial_start');assert.equal(started.plan,'Elite');assert.equal(started.effectivePlan,'Elite');assert.equal(started.limits.playgrounds,5);assert.equal(started.limits.managers,5);assert.equal(started.limits.runs,null);
assert.equal(new Date(started.elite_trial_ends_at)-new Date(started.elite_trial_started_at),15*86400000);
assert.equal((await op('elite_trial_start'))._error.status,403);
assert.equal((await op('elite_trial_start',users[1]))._error.status,403);
assert.equal((await op('elite_trial_start',users[2]))._error.status,403);
assert.equal((await op('elite_trial_start',users[3]))._error.status,403);
assert.equal((await op('elite_trial_start',null))._error.status,401);
assert.equal((await op('public_shop',null)).length,1);
assert.equal((await op('settings_get',users[0],{},uuid(20))).ownerPlan,'Elite');
assert.equal((await db.query('select public.loot_manager_discord_allowed($1) allowed',[users[0].id])).rows[0].allowed,false);
await db.query("update public.loot_manager_accounts set elite_trial_started_at=now()-interval '16 days',elite_trial_ends_at=now()-interval '1 day' where id=$1",[users[0].id]);
// Even before another operation cleans up the assigned plan, timestamp enforcement has expired.
assert.equal((await db.query('select public.loot_manager_effective_plan($1) plan',[users[0].id])).rows[0].plan,'Free');
assert.deepEqual(await op('public_shop',null),[]);
const ended=await op('account');assert.equal(ended.plan,'Free');assert.deepEqual(ended.limits,{runs:200,managers:0,playgrounds:1});
const originalLedger=(await db.query('select payload from public.loot_manager_ledgers where guild_id=$1',[uuid(20)])).rows[0].payload;assert.equal(originalLedger.runs[0].loots[0].quantity,12);
const fullState={...originalLedger,runs:Array.from({length:200},(_,i)=>({id:'run-'+i,dungeon:'Test dungeon',createdAt:new Date().toISOString(),memberIds:['member'],loots:[{id:'loot-'+i,name:'Sunstone',quantity:1}]}))};
assert.equal((await op('ledger_save',users[0],{version:0,state:fullState,notifications:[]},uuid(20))).version,1);
assert.equal((await op('ledger_save',users[0],{version:1,state:{...fullState,runs:[...fullState.runs,{...fullState.runs[0],id:'run-201'}]},notifications:[]},uuid(20)))._error.status,403);
await db.query('update public.loot_manager_accounts set limit_overrides=$2 where id=$1',[users[0].id,JSON.stringify({runs:77})]);
assert.equal((await op('account')).limits.runs,77);
await db.query("update public.loot_manager_accounts set limit_overrides='{}' where id=$1",[users[0].id]);
assert.equal((await op('elite_trial_notice')).expired,true);assert.equal((await op('elite_trial_notice')).expired,false);
assert.equal((await op('elite_trial_start'))._error.status,409);
const admin=users[5];const assign=async(user,plan,extra={})=>op('platform_update',admin,{userId:user.id,plan,overrides:{},banned:false,paused:false,pausedUntil:null,...extra});
await op('elite_trial_start',users[4]);
// Saving a ban/pause/override setting does not accidentally make a trial permanent.
await assign(users[4],'Elite');assert.equal((await op('account',users[4])).elite_trial_cancelled_at,null);
await assign(users[4],'Elite',{assignPlan:true});assert.ok((await op('account',users[4])).elite_trial_cancelled_at);
await db.query("update public.loot_manager_accounts set elite_trial_ends_at=now()-interval '1 day' where id=$1",[users[4].id]);
assert.equal((await op('account',users[4])).plan,'Elite');assert.equal((await op('elite_trial_notice',users[4])).expired,false);
// An upgrade after trial expiry must also survive further expiry checks.
await assign(users[0],'Legend');assert.equal((await op('account')).plan,'Legend');
await assign(users[0],'Free');assert.equal((await op('elite_trial_start'))._error.status,409);
const page=await op('platform_users_page',admin,{page:1,query:''});assert.ok(page.users.find(u=>u.id===users[0].id).elite_trial_started_at);
await db.exec('reset role;set role authenticated');await assert.rejects(()=>op('elite_trial_start'),/permission denied/);
console.log('PASS: exact 15-day once-only trial, eligibility, Elite entitlements, automatic Free fallback, retained data, one-time notice, manual upgrades and admin settings.');
}catch(e){console.error({message:e.message,position:e.position,internalPosition:e.internalPosition,internalQuery:e.internalQuery,where:e.where});process.exitCode=1;}finally{await db.close();}


