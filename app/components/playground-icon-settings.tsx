"use client";
import {useState} from 'react';
import {PlaygroundIcon} from './playground-icon';
import {request} from './guild-workspace';
export function PlaygroundIconSettings({guild,owner,onSaved}:{guild:{id:string;name:string;icon?:string|null};owner:boolean;onSaved:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const save=async(icon:string|null)=>{await request('/api/playgrounds/icon','PUT',{icon},guild.id);await onSaved();setMessage(icon?'Playground icon updated.':'Default icon restored.');};
  async function upload(file:File){setBusy(true);setMessage('');let bitmap:ImageBitmap|undefined;try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPEG or WebP image under 10 MB.');
    bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare this image.');
    const size=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,192,192);
    const icon=canvas.toDataURL('image/webp',.85);if(!icon.startsWith('data:image/webp;base64,')||icon.length>87500)throw new Error('Choose a simpler or smaller image.');
    await save(icon);
  }catch(e){setMessage((e as Error).message);}finally{bitmap?.close();setBusy(false);}}
  return <div className="playground-icon-settings"><PlaygroundIcon name={guild.name} icon={guild.icon}/><div><strong>Playground icon</strong><p>Shown in playgrounds, shops, inquiries and your ledger. No upload uses the default icon.</p>{owner&&<div className="inline-actions"><label className="icon-upload-button">{busy?'Uploading…':'Upload icon'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>{guild.icon&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await save(null);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Use default</button>}</div>}{message&&<small role="status">{message}</small>}</div></div>;
}
