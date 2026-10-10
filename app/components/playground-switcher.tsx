"use client";
import {StyledSelect} from "./styled-select";
import {useEffect,useState} from 'react';
import {request} from './guild-workspace';
export function PlaygroundSwitcher({currentId,disabled=false}:{currentId?:string;disabled?:boolean}){
  const [guilds,setGuilds]=useState<Array<{id:string;name:string;role:string}>>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void request<{guilds:typeof guilds}>('/api/playgrounds').then(d=>{if(active)setGuilds(d.guilds);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  return <div className="sidebar-switcher"><label htmlFor="sidebar-playground">Current playground</label><StyledSelect dark aria-label="Current playground" id="sidebar-playground" value={currentId??''} disabled={disabled||busy||!guilds.length} onChange={async e=>{setBusy(true);setError('');try{await request('/api/playgrounds/select','POST',{guildId:e.target.value});window.location.assign('/overview');}catch(e){setError((e as Error).message);setBusy(false);}}}><option value="" disabled>Choose playground</option>{guilds.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</StyledSelect>{busy&&<small>Opening playground…</small>}{error&&<small role="alert">{error}</small>}<a href="/playgrounds">Create or join a playground ↗</a></div>;
}
