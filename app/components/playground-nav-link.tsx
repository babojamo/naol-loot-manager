"use client";
import {useEffect,useState} from 'react';
export function PlaygroundNavLink(){
  const [guild,setGuild]=useState<{name:string}|null>(null);
  useEffect(()=>{let active=true;const load=()=>{void fetch('/api/auth/status',{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{authenticated:boolean;guild:{name:string}|null}>:null).then(d=>{if(active)setGuild(d?.authenticated?d.guild:null);}).catch(()=>{});};load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};},[]);
  return <a className="lm-button manage-playground-link" href={guild?'/overview':'/playgrounds'}>{guild?`Manage ${guild.name}`:'My playgrounds'} <span>↗</span></a>;
}
