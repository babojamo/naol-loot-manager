"use client";
import {Children,isValidElement,type ReactNode} from 'react';
import {Select} from 'radix-ui';
import {Check,ChevronDown,ChevronUp} from 'lucide-react';

// Keep the existing option markup while giving every menu the same accessible UI.
export function StyledSelect({value,onChange,children,disabled,id,'aria-label':label,dark=false}:{value:string;onChange:(event:{target:{value:string}})=>void;children:ReactNode;disabled?:boolean;id?:string;'aria-label':string;dark?:boolean}){
  const options=Children.toArray(children).filter(isValidElement).map(child=>child.props as {value?:string;children:ReactNode;disabled?:boolean});
  const placeholder=options.find(o=>o.disabled&&o.value==='');
  const encode=(v:string)=>v||'__naol_empty__';
  return <Select.Root value={encode(value)} disabled={disabled} onValueChange={v=>onChange({target:{value:v==='__naol_empty__'?'':v}})}>
    <Select.Trigger id={id} aria-label={label} className={`naol-select-trigger${dark?' naol-select-dark':''}`}><Select.Value>{options.find(o=>(o.value??String(o.children))===value)?.children ?? placeholder?.children ?? "Choose…"}</Select.Value><Select.Icon><ChevronDown size={16}/></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={7} align="start" className={`naol-select-menu${dark?' naol-select-dark':''}`}>
      <Select.ScrollUpButton className="naol-select-scroll"><ChevronUp size={15}/></Select.ScrollUpButton>
      <Select.Viewport>{options.map((o,i)=>{if(o===placeholder)return null;const v=o.value??String(o.children);return <Select.Item value={encode(v)} disabled={o.disabled} key={v+':'+i} className="naol-select-option"><Select.ItemText>{o.children}</Select.ItemText><Select.ItemIndicator><Check size={15}/></Select.ItemIndicator></Select.Item>;})}</Select.Viewport>
      <Select.ScrollDownButton className="naol-select-scroll"><ChevronDown size={15}/></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
