import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:4179';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Run against a local test database only.');
const suffix=Date.now();
const alice={id:`test-alice-${suffix}`,email:`alice-${suffix}@example.com`},bob={id:`test-bob-${suffix}`,email:`bob-${suffix}@example.com`},carol={id:`test-carol-${suffix}`,email:`carol-${suffix}@example.com`};
async function call(path,{user,cookie,method='GET',body,expected=200,headers={}}={}){
  const r=await fetch(base+path,{method,headers:{...(user?{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email}:{}),...(cookie?{cookie}:{}),'content-type':'application/json',connection:'close',...headers},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  assert.equal(r.status,expected,`${method} ${path}: ${text.slice(0,400)}`);
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
await call('/api/state',{expected:401});
await call('/api/guilds',{method:'POST',body:{},expected:401});

const a=await call('/api/guilds',{user:alice,method:'POST',body:{name:'Test Alpha',slug:`alpha-${suffix}`,isPublic:true},expected:201});
const b=await call('/api/guilds',{user:bob,method:'POST',body:{name:'Test Beta',slug:`beta-${suffix}`},expected:201});
const initial=await call('/api/state',{user:alice,cookie:a.cookie});assert.equal(initial.data.state.members.length,0);
const state={...initial.data.state,members:[{id:'alpha-player',name:'Alpha player',active:true}],runs:[{id:'alpha-run',dungeon:'Alpha dungeon',createdAt:new Date().toISOString(),memberIds:['alpha-player'],loots:[{id:'alpha-loot',name:'Alpha gem',quantity:3}]}],vendingPrices:{'Alpha gem':25}};
await call('/api/state',{user:alice,cookie:a.cookie,method:'PUT',body:{guildId:a.data.id,version:0,action:'Test run',state}});
const beta=await call('/api/state',{user:bob,cookie:b.cookie});assert.equal(beta.data.state.runs.length,0);
await call('/api/state',{user:bob,cookie:a.cookie,expected:403});
await call('/api/state',{user:bob,cookie:a.cookie,method:'PUT',body:{guildId:a.data.id,version:1,action:'Intrusion',state},expected:403});
await call('/api/guilds/select',{user:bob,method:'POST',body:{guildId:a.data.id},expected:403});
await call('/api/state',{user:alice,cookie:a.cookie,method:'PUT',body:{guildId:b.data.id,version:1,action:'Wrong tab',state},expected:409});
await call('/api/state',{user:alice,cookie:a.cookie,method:'PUT',body:{guildId:a.data.id,version:0,action:'Stale edit',state},expected:409});
await call('/api/state',{user:alice,cookie:a.cookie,method:'PUT',body:{guildId:a.data.id,version:1,action:'Cross site',state},headers:{origin:'https://other.example'},expected:403});
const shop=await call(`/api/shop?guild=alpha-${suffix}`);assert.ok(JSON.stringify(shop.data).includes('Alpha gem'));assert.ok(!JSON.stringify(shop.data).includes(alice.email));
await call(`/api/shop?guild=beta-${suffix}`,{expected:404});
const invite=await call('/api/guilds/invites',{user:alice,cookie:a.cookie,method:'POST',body:{email:carol.email,role:'manager'},expected:201});
const token=new URL(invite.data.joinPath,base).searchParams.get('token');
await call('/api/guilds/join',{user:bob,method:'POST',body:{token},expected:403});
const joined=await call('/api/guilds/join',{user:carol,method:'POST',body:{token}});
const shared=await call('/api/state',{user:carol,cookie:joined.cookie});assert.equal(shared.data.state.members[0].name,'Alpha player');
await call('/api/guilds/invites',{user:carol,cookie:joined.cookie,method:'POST',body:{email:bob.email,role:'manager'},expected:403});
await call('/api/guilds/settings',{user:carol,cookie:joined.cookie,method:'PUT',body:{name:'Changed',description:'',isPublic:true},expected:403});
await call('/api/guilds/settings',{user:alice,cookie:a.cookie,method:'DELETE',body:{userId:carol.id}});
await call('/api/state',{user:carol,cookie:joined.cookie,expected:403});
const guilds=await call('/api/guilds',{user:bob});assert.equal(guilds.data.guilds.length,1);assert.equal(guilds.data.guilds[0].id,b.data.id);
console.log('PASS: anonymous access, blank guild creation, tenant isolation, public visibility, stale saves, cross-tab protection, invitation identity, manager permissions and revocation.');
