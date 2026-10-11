import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);');
for (const file of (await readdir('supabase')).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&(!process.env.TEST_MISSING_CATALOG||!f.startsWith('013_'))).sort()) await db.exec(await readFile('supabase/'+file,'utf8'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owners=[1,2,3].map(n=>({id:uuid(n),email:`owner${n}@example.com`}));
const img='data:image/png;base64,aGVsbG8=';
for (const [i,u] of owners.entries()) {
await db.query('insert into auth.users values($1,$2,now(),$3)',[u.id,u.email,JSON.stringify({name:'Owner',username:`owner${i}`})]);
await db.query('insert into public.loot_manager_guilds(id,name,slug) values($1,$2,$3)',[uuid(10+i),`Private ${i}`,`private-${i}`]);
await db.query("insert into public.loot_manager_guild_users(guild_id,user_id,role) values($1,$2,'owner')",[uuid(10+i),u.id]);
await db.query('insert into public.loot_manager_ledgers(guild_id,payload) values($1,$2)',[uuid(10+i),JSON.stringify({members:[{name:'Secret player'}],runs:[{loots:[{name:i===2?'Banned item':i===1?'Sunstone':' sunstone ',quantity:999}]}],sales:[{price:123}],lootImages:i?{Sunstone:img,'Image-only item':img}:{}})]);
}
await db.query('update public.loot_manager_accounts set banned=true where id=$1',[owners[2].id]);
const op=async(user,data={})=>(await db.query("select public.loot_manager_operation('loot_catalog',$1::jsonb,$2,$3::jsonb) result",[JSON.stringify(user),uuid(10),JSON.stringify(data)])).rows[0].result;
await db.exec('set role service_role');
const names=await op(owners[0]);assert.deepEqual(names,['Image-only item','Sunstone']);
const images=await op(owners[0],{names:[' SUNSTONE ','Unknown']});assert.deepEqual(images,{sunstone:img});
assert.equal((await op(owners[1]))._error.status,403);
assert.equal((await op(owners[0],{names:Array(101).fill('Sunstone')}))._error.status,400);
assert.equal((await op(owners[0],{names:null}))._error.status,400);
assert.equal((await op(owners[0],{names:[null]}))._error.status,400);
await db.query("update public.loot_manager_ledgers set payload=jsonb_set(jsonb_set(payload,'{lootImages}','null'),'{runs}','null') where guild_id=$1",[uuid(12)]);
assert.deepEqual(await op(owners[0]),names);
assert.equal(JSON.stringify({names,images}).includes('Secret'),false);
await db.exec('reset role;set role authenticated');await assert.rejects(()=>op(owners[0]),/permission denied/);
console.log('PASS: private playground catalog projection, case deduplication, image lookup, banned exclusion, membership and service-only access.');
} finally {await db.close();}
