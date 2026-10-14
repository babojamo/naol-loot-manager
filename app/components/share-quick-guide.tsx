"use client";
import {useState} from 'react';
import {Check,Copy,Share2} from 'lucide-react';
import {quickGuide} from '../../lib/quick-guide';
export function ShareQuickGuide(){
  const [copied,setCopied]=useState(false),[message,setMessage]=useState('');
  async function copy(){try{await navigator.clipboard.writeText(quickGuide.url);setCopied(true);setMessage('Video link copied. Paste it into your post or message.');}catch{setMessage(`Copy this video link: ${quickGuide.url}`);}}
  async function share(){if(!navigator.share){await copy();return;}try{await navigator.share({title:quickGuide.title,text:quickGuide.description,url:quickGuide.url});}catch(e){if((e as Error).name!=='AbortError')await copy();}}
  return <div className="video-share"><div className="video-share-actions"><button type="button" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Link copied':'Copy video link'}</button><button type="button" onClick={()=>void share()}><Share2 size={16}/>Share video</button><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(quickGuide.url)}`} target="_blank" rel="noopener noreferrer">Share on Facebook ↗</a></div>{message&&<p role="status">{message}</p>}</div>;
}
