"use client";
import {useState} from 'react';
import {Gem} from 'lucide-react';
export function PlaygroundIcon({icon,name,className=''}:{icon?:string|null;name:string;className?:string}){
  const [failed,setFailed]=useState<string|null>(null);
  return <span className={`playground-icon ${className}`} aria-label={`${name} icon`}>{icon&&failed!==icon?<img src={icon} alt="" onError={()=>setFailed(icon)}/>:<Gem size={24}/>}</span>;
}
