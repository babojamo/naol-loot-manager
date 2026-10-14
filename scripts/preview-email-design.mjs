import {mkdir,writeFile} from 'node:fs/promises';
import {invitationEmail} from '../lib/invitation-delivery.ts';
import {sharedRunEmail} from '../lib/run-share-email.ts';
import {contactEmail} from '../lib/contact-delivery.ts';
import {mailPayload} from '../lib/platform-mail.ts';
const directory=new URL('../outputs/email-design-preview/',import.meta.url);await mkdir(directory,{recursive:true});
const token='a'.repeat(64),from='NAOL <mail@example.com>',base={key:'not-used',from,playground:'Example Playground',inviter:'Example Owner'};
const job={id:'preview',kind:'plan_change',subject:null,message:null,oldPlan:'Free',newPlan:'Elite',status:'pending',createdAt:'',actorName:'Administrator',error:null,recipients:[{position:1,accountId:'example',name:'Example Player',email:'player@example.com',providerId:null}]};
const samples={
  'plan-upgrade':mailPayload(job,from)[0],
  'plan-downgrade':mailPayload({...job,oldPlan:'Legend',newPlan:'Free'},from)[0],
  'admin-message':mailPayload({...job,kind:'manual',subject:'A thank-you from the NAOL team',message:'Hi everyone,\n\nThank you for being part of NAOL. Your ideas, feedback and support help make this a welcoming place for every party.\n\nWe’re happy to have you with us.\n\nThe NAOL team'},from)[0],
  'playground-invitation':invitationEmail({...base,email:'party@example.com',id:'preview',joinPath:'/join?token='+token}),
  'shared-run':sharedRunEmail({...base,emails:['party@example.com'],dungeon:'Ankou’s Asylum',token,revision:1},'party@example.com'),
  'contact-message':contactEmail({...base,email:'player@example.com',subject:'Thank you for NAOL',message:'Hi NAOL team,\n\nOur party has been enjoying the shared loot ledger. Thank you for making it easier to track our adventures together.',requestId:'preview'}),
};
for(const [name,email] of Object.entries(samples))await writeFile(new URL(name+'.html',directory),email.html);
await writeFile(new URL('index.html',directory),'<!doctype html><html><meta charset="utf-8"><title>NAOL email design previews</title><body style="font:16px/1.8 Arial;background:#f6f4ee;padding:30px"><h1>NAOL email designs</h1><p>Example data only. No emails are sent by this preview.</p>'+Object.keys(samples).map(name=>'<p><a href="'+name+'.html">'+name+'</a></p>').join('')+'</body></html>');
console.log('Saved six application email previews to outputs/email-design-preview. No emails sent.');
