import assert from 'node:assert/strict';
import {sendInvitationEmail} from '../lib/invitation-delivery.ts';
const data={key:'test',from:'NAOL <contact@example.com>',email:'invited@example.com',playground:'Example Playground',inviter:'Example Owner',id:crypto.randomUUID(),joinPath:'/join?token='+'a'.repeat(64)};
assert.equal(await sendInvitationEmail(data,async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'manual');
  assert.equal(init.headers['Idempotency-Key'],'naol-invite-'+data.id);
  const body=JSON.parse(init.body);assert.deepEqual(body.to,[data.email]);assert.match(body.text,/https:\/\/naol\.lokwensio\.com\/join\?token=/);assert.ok(body.text.includes(data.email));assert.match(body.text,/seven days/);assert.match(body.text,/Registration will continue/);assert.ok(body.text.includes(data.playground));
  return new Response('{"id":"accepted"}',{status:200});
}),true);
assert.equal(await sendInvitationEmail(data,async()=>new Response('{}',{status:403})),false);
assert.equal(await sendInvitationEmail(data,async()=>{throw new Error('Network failure');}),false);
console.log('PASS: invitation recipient, canonical join link, expiry, idempotency and truthful provider/network failures.');
