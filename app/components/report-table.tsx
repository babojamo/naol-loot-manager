"use client";
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Search} from 'lucide-react';
import {PenyaAmount} from './penya';
import type {ReportModel} from '../../lib/reports';
export function ReportTable({report,publicView=false}:{report:ReportModel;publicView?:boolean}){
  const [page,setPage]=useState(1),[query,setQuery]=useState('');
  const rows=report.rows.filter(r=>!query||Object.values(r.cells).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(rows.length/50));const current=Math.min(page,pages),shown=rows.slice((current-1)*50,current*50);
  useEffect(()=>setPage(1),[report,query]);
  return <div className="report-output"><div className="report-summary">{report.summary.map(item=><div key={item.label}><span>{item.label}</span><strong>{item.money?<PenyaAmount value={item.value}/>:item.value.toLocaleString()}</strong></div>)}</div>
    {publicView&&<label className="report-public-search"><Search size={16}/><input aria-label="Search this shared report" placeholder="Search within this shared report…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
    <p className="report-note">{report.note}</p><div className="report-table-scroll"><table className="report-table"><caption>{report.title} · {report.playground}</caption><thead><tr>{report.columns.map(c=><th scope="col" className={c.kind==='money'||c.kind==='number'?'report-numeric':''} key={c.key}>{c.label}</th>)}</tr></thead><tbody>{shown.length?shown.map((row,index)=><tr key={row.id} className={report.type==='drops'&&(index===0||row.cells.run!==shown[index-1]?.cells.run)?'report-run-start':''}>{report.columns.map(c=>{
      const value=row.cells[c.key];return <td key={c.key} className={c.kind==='money'||c.kind==='number'?'report-numeric':''}>{c.kind==='money'?<PenyaAmount value={Number(value)}/>:c.kind==='date'?<time dateTime={String(value)}>{new Date(value).toLocaleString('en-US',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'})}</time>:c.kind==='number'?Number(value).toLocaleString():c.kind==='status'?<span className={`report-status ${value==='Sold out'?'sold-out':value==='Partially sold'?'partial':'available'}`}>{value}</span>:value||'—'}</td>;
    })}</tr>):<tr><td colSpan={report.columns.length} className="report-empty">No records match these filters.</td></tr>}</tbody></table></div>
    <div className="report-pagination"><span>{rows.length?`${(current-1)*50+1}–${Math.min(current*50,rows.length)} of ${rows.length} rows`:'0 rows'} · 50 per page</span><div><button type="button" disabled={current<=1} onClick={()=>setPage(current-1)} aria-label="Previous report page"><ChevronLeft size={16}/></button><span>Page {current} of {pages}</span><button type="button" disabled={current>=pages} onClick={()=>setPage(current+1)} aria-label="Next report page"><ChevronRight size={16}/></button></div></div>
  </div>;
}
