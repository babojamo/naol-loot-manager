import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderNaolEmail,emailSubject} from '../lib/email-design.mjs';
import {invitationEmail,sendInvitationEmail} from '../lib/invitation-delivery.ts';
import {sharedRunEmail,sendRunShareEmails} from '../lib/run-share-email.ts';
import {contactEmail,sendContactEmail} from '../lib/contact-delivery.ts';
import {mailPayload} from '../lib/platform-mail.ts';
const token='a'.repeat(64),unsafe='<script>alert("unsafe")</script>',from='NAOL <mail@example.com>';
const invite={key:'mock-only',from,email:'party@example.com',playground:unsafe,inviter:'Party Owner',id:crypto.randomUUID(),joinPath:'/join?token='+token};
const run={key:'mock-only',from,emails:['one@example.com','two@example.com'],playground:'Example Party',dungeon:unsafe,inviter:'Party Owner',token,revision:2};
const contact={key:'mock-only',from,email:'player@example.com',subject:unsafe,message:'A message containing '+unsafe,requestId:crypto.randomUUID(),account:'player@example.com'};
const job={id:crypto.randomUUID(),kind:'plan_change',subject:null,message:null,oldPlan:'Free',newPlan:'Legend',status:'pending',createdAt:new Date().toISOString(),actorName:'Administrator',error:null,recipients:[{position:1,accountId:'example',name:'Example Player',email:'player@example.com',providerId:null}]};
const samples=[invitationEmail(invite),sharedRunEmail(run,run.emails[0]),contactEmail(contact),mailPayload(job,from)[0],mailPayload({...job,oldPlan:'Legend',newPlan:'Free'},from)[0],mailPayload({...job,kind:'manual',subject:unsafe,message:unsafe},from)[0]];
for(const email of samples){assert.ok(email.html.startsWith('<!doctype html>'));assert.match(email.html,/naol-email-card/);assert.match(email.html,/role="presentation"/);assert.match(email.html,/#6556d8/);assert.match(email.html,/Contact NAOL/);assert.match(email.html,/lang="en"/);assert.ok(!email.html.includes('<script>'));assert.ok(email.text.length>50);assert.ok(email.text.includes('https://naol.lokwensio.com'));assert.ok(!/[\r\n]/.test(email.subject));}
assert.match(samples[0].html,/&lt;script&gt;/);assert.match(samples[1].html,/&lt;script&gt;/);assert.match(samples[2].html,/&lt;script&gt;/);assert.match(samples[5].html,/&lt;script&gt;/);
assert.ok(samples[0].html.includes('https://naol.lokwensio.com/join?token='+token));assert.match(samples[0].text,/seven days/);assert.match(samples[0].text,/Registration will continue/);
assert.ok(samples[1].html.includes('https://naol.lokwensio.com/shared-runs/'+token));assert.match(samples[1].text,/has no expiry/);assert.ok(!samples[1].html.includes(run.emails[1]));
assert.equal(emailSubject('An owner\r\nBcc: another@example.com').includes('\n'),false);
assert.throws(()=>renderNaolEmail({title:'Example',body:'Example',button:{text:'Unsafe',href:'javascript:alert(1)'}}));
for(const path of ['https://untrusted.invalid/join?token='+token,'//untrusted.invalid/join?token='+token,'/join?token=invalid']){let called=false;assert.equal(await sendInvitationEmail({...invite,joinPath:path},async()=>{called=true;return Response.json({id:'never'});}),false);assert.equal(called,false);}
assert.equal(await sendInvitationEmail(invite,async(url,init)=>{const payload=JSON.parse(init.body);assert.deepEqual(payload.to,[invite.email]);assert.equal(init.headers['Idempotency-Key'],'naol-invite-'+invite.id);assert.ok(payload.html);return Response.json({id:'accepted'});}),true);
assert.equal(await sendContactEmail(contact,async(url,init)=>{const payload=JSON.parse(init.body);assert.deepEqual(payload.to,['kevin.loquencio@gmail.com']);assert.equal(payload.reply_to,contact.email);assert.equal(init.headers['Idempotency-Key'],'naol-contact-'+contact.requestId);assert.ok(payload.html);return Response.json({id:'accepted'});}),true);
assert.deepEqual(await sendRunShareEmails(run,async(url,init)=>{const payload=JSON.parse(init.body);assert.equal(payload.length,2);assert.deepEqual(payload.map(p=>p.to),run.emails.map(email=>[email]));assert.ok(payload.every(p=>p.html&&p.text));return Response.json({data:[{id:'one'},{}]});}),['two@example.com']);
const config=JSON.parse(await readFile(new URL('../supabase/email-templates/auth-email-design.json',import.meta.url),'utf8'));assert.equal(Object.keys(config).length,26);
for(const [key,value] of Object.entries(config)){assert.ok(/^mailer_(subjects_[a-z_]+|templates_[a-z_]+_content)$/.test(key));assert.ok(!key.includes('_enabled'));if(key.endsWith('_content')){assert.match(value,/naol-email-card/);assert.match(value,/Contact NAOL/);if(key!=='mailer_templates_recovery_content')assert.ok(!value.includes('TokenHash'));}}
for(const key of ['confirmation','invite','magic_link','email_change'])assert.equal(config['mailer_templates_'+key+'_content'].split('{{ .ConfirmationURL }}').length-1,3);
assert.match(config.mailer_templates_reauthentication_content,/{{ \.Token }}/);assert.match(config.mailer_templates_email_change_content,/{{ \.NewEmail }}/);assert.match(config.mailer_templates_email_changed_notification_content,/{{ \.OldEmail }}/);
console.log('All app email designs, HTML escaping, secure links, recipient privacy, transport contracts and 13 Supabase template placeholders passed. No real emails sent.');

assert.equal(config.mailer_templates_recovery_content.split('{{ .TokenHash }}').length-1,3);
assert.ok(config.mailer_templates_recovery_content.includes('https://naol.lokwensio.com/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery'));
assert.ok(!config.mailer_templates_recovery_content.includes('{{ .ConfirmationURL }}'));
