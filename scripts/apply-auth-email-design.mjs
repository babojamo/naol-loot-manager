import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
const project='jpevnyalkjzfjtsqkagp';
const config=JSON.parse(await readFile(new URL('../supabase/email-templates/auth-email-design.json',import.meta.url),'utf8'));
const keys=Object.keys(config);
if(keys.length!==26||keys.some(k=>!/^mailer_(subjects_[a-z_]+|templates_[a-z_]+_content)$/.test(k)))throw new Error('The package must contain only the 13 template designs and subjects.');
if(process.argv.includes('--validate-only')){console.log('Validated 13 templates. No credentials requested and no network requests made.');process.exit(0);}
if(!process.stdin.isTTY)throw new Error('Run this command in an interactive terminal so the token can be entered privately.');
console.log(`Apply the NAOL email design to Supabase project ${project}.`);
console.log('Existing SMTP, redirects, authentication and notification enablement settings will be preserved.');
process.stdout.write('Supabase personal access token (hidden; never saved): ');
const hiddenOutput=new Writable({write(chunk,encoding,callback){callback();}});
const input=createInterface({input:process.stdin,output:hiddenOutput,terminal:true});
const cancel=new AbortController();input.once('SIGINT',()=>cancel.abort());
let token='';let headers;
try{
  try{token=(await input.question('',{signal:cancel.signal})).trim();}finally{input.close();process.stdout.write('\n');}
  if(!token)throw new Error('No token entered. Nothing was changed.');
  headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const endpoint=`https://api.supabase.com/v1/projects/${project}/config/auth`;
  async function request(method,body){const response=await fetch(endpoint,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Supabase returned ${response.status} during ${method}. Check your personal access token and its access to the NAOL project.`);return response.json();}
  const current=await request('GET');
  const previous=Object.fromEntries(Object.entries(current).filter(([name])=>/^mailer_(subjects_|templates_)/.test(name)));
  const backupDirectory=new URL('../outputs/email-template-backups/',import.meta.url);await mkdir(backupDirectory,{recursive:true});
  const backupPath=new URL('before-naol-design-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',backupDirectory);
  await writeFile(backupPath,JSON.stringify(previous,null,2)+'\n');
  for(const key of ['confirmation','invite','magic_link','email_change','recovery']){
    const existing=current['mailer_templates_'+key+'_content'];
    if(existing&&(!/{{\s*\.ConfirmationURL\s*}}/.test(existing)||/{{\s*\.TokenHash/.test(existing)))throw new Error(`The existing ${key} template uses custom authentication links. No templates were changed. Review the backup and preserve those links when applying the design manually.`);
  }
  await request('PATCH',config);const verified=await request('GET');
  for(const key of keys)if(verified[key]!==config[key])throw new Error(`Could not verify ${key}. Check the Supabase Email Templates page.`);
  console.log('All 13 email designs and subjects were saved and verified. No emails were sent.');
  console.log('Previous templates were backed up in D:/codes/loot-manager/outputs/email-template-backups.');
}catch(error){console.error(error.name==='AbortError'?'Cancelled; no token was saved.':error.message);process.exitCode=1;}
finally{token='';if(headers)headers.Authorization='';}
