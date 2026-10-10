import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);');
for(const file of (await readdir(new URL('../supabase/',import.meta.url))).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner={id:uuid(1),email:'owner@example.com'},manager={id:uuid(2),email:'manager@example.com'},guild=uuid(10);
for(const [i,u]of [owner,manager].entries())await db.query('insert into auth.users values($1,$2,now(),$3)',[u.id,u.email,JSON.stringify({name:'Test User',username:`test${i}`})]);
await db.query("update public.loot_manager_accounts set plan='Elite' where id=$1",[owner.id]);
await db.query("insert into public.loot_manager_guilds(id,name,slug,shop_enabled) values($1,'Test','test',true)",[guild]);
await db.query("insert into public.loot_manager_guild_users(guild_id,user_id,role) values($1,$2,'owner'),($1,$3,'manager')",[guild,owner.id,manager.id]);
await db.query("insert into public.loot_manager_ledgers(guild_id,payload) values($1,'{\"members\":[],\"runs\":[],\"sales\":[],\"auditLog\":[]}')",[guild]);
const op=async(operation,user=owner,data={})=>(await db.query('select public.loot_manager_operation($1,$2::jsonb,$3,$4::jsonb) result',[operation,user?JSON.stringify(user):null,guild,JSON.stringify(data)])).rows[0].result;
await db.exec('set role service_role');
const settings={name:'Test',description:'',shopEnabled:true,inquiriesEnabled:false,vendorContactMessage:'Whisper Vendor\nServer: Rhisis'};
assert.equal((await op('settings_update',manager,settings))._error.status,403);
assert.equal((await op('settings_update',owner,settings))._error,undefined);
assert.equal((await op('settings_get')).guild.vendor_contact_message,settings.vendorContactMessage);
assert.equal((await op('public_shop',null))[0].guild.vendor_contact_message,settings.vendorContactMessage);
assert.equal((await op('settings_update',owner,{...settings,vendorContactMessage:'a'.repeat(2001)}))._error.status,400);
await op('settings_update',owner,{...settings,shopEnabled:false});assert.deepEqual(await op('public_shop',null),[]);
assert.equal((await op('settings_get')).guild.vendor_contact_message,settings.vendorContactMessage);
await op('settings_update',owner,settings);await db.query('update public.loot_manager_accounts set banned=true where id=$1',[owner.id]);assert.deepEqual(await op('public_shop',null),[]);
await db.exec('reset role;set role authenticated');await assert.rejects(()=>op('settings_update',owner,settings),/permission denied/);
console.log('PASS: owner-only vendor message, persistence, public projection, length limit and disabled/banned shop privacy.');
}finally{await db.close();}
