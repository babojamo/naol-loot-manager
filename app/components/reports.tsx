"use client";
import {useMemo,useState} from 'react';
import {FileText,Share2,X} from 'lucide-react';
import {StyledSelect} from './styled-select';
import {ReportTable} from './report-table';
import {ReportSharing} from './report-sharing';
import {buildReport,emptyReportFilters,reportTitles,type ReportType,type ReportFilters} from '../../lib/reports';
import type {LootState} from '../../lib/types';
export function Reports({state,guildId,playground,connected}:{state:LootState;guildId:string;playground:string;connected:boolean}){
  const [type,setType]=useState<ReportType>('inventory'),[filters,setFilters]=useState<ReportFilters>(emptyReportFilters);
  const invalidDates=Boolean(filters.from&&filters.to&&filters.from>filters.to);
  const report=useMemo(()=>buildReport(state,type,filters,playground),[state,type,filters,playground]);
  const dungeons=[...new Set(state.runs.map(r=>r.dungeon))].sort((a,b)=>a.localeCompare(b));
  const update=(field:keyof ReportFilters,value:string)=>setFilters(f=>({...f,[field]:value}));
  return <div className="reports-manager"><div className="page-title"><div><span>PLAYGROUND REPORTS</span><h1>Reports</h1><p>Review the ledger in tables and share exactly the report you need.</p></div><ReportSharing type={type} filters={filters} guildId={guildId} disabled={!connected||invalidDates}/></div>
    <div className="report-tabs" role="tablist" aria-label="Report type">{(Object.keys(reportTitles) as ReportType[]).map(t=><button role="tab" aria-selected={type===t} type="button" key={t} className={type===t?'active':''} onClick={()=>{setType(t);if(t==='sales')setFilters(f=>({...f,status:''}));}}><FileText size={15}/>{reportTitles[t]}</button>)}</div>
    <div className="report-filters"><label className="report-filter-search">Search<input value={filters.search} maxLength={120} placeholder={type==='inventory'?'Item name…':'Item, dungeon, member or run…'} onChange={e=>update('search',e.target.value)}/></label><label>From date<input type="date" value={filters.from} max={filters.to||undefined} onChange={e=>update('from',e.target.value)}/></label><label>To date<input type="date" value={filters.to} min={filters.from||undefined} onChange={e=>update('to',e.target.value)}/></label><label>Dungeon<StyledSelect aria-label="Report dungeon filter" value={filters.dungeon} onChange={e=>update('dungeon',e.target.value)}><option value="">All dungeons</option>{dungeons.map(d=><option key={d} value={d}>{d}</option>)}</StyledSelect></label><label>Member<StyledSelect aria-label="Report member filter" value={filters.member} onChange={e=>update('member',e.target.value)}><option value="">All members</option>{[...state.members].sort((a,b)=>a.name.localeCompare(b.name)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</StyledSelect></label>{type!=='sales'&&<label>Loot status<StyledSelect aria-label="Report loot status filter" value={filters.status} onChange={e=>update('status',e.target.value)}><option value="">All statuses</option><option value="available">Has available loot</option><option value="sold-out">Sold out</option><option value="partial">Partially sold</option><option value="unsold">Unsold</option></StyledSelect></label>}<button type="button" className="report-clear" onClick={()=>setFilters(emptyReportFilters)}><X size={14}/>Clear filters</button></div>
    {invalidDates?<p className="portal-alert" role="alert">Choose a start date before the end date.</p>:<ReportTable report={report}/>}<p className="report-timezone">All dates use Singapore time. Public sharing is available on every plan.</p>
  </div>;
}
