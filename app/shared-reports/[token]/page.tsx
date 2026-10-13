import type {Metadata} from 'next';
import {database} from '../../../lib/supabase-store';
import {tokenHash,ApiError} from '../../../lib/tenant';
import {buildReport,reportTitles,type ReportType,type ReportFilters} from '../../../lib/reports';
import {reportFilterSchema,reportScope} from '../../../lib/report-sharing';
import type {LootState} from '../../../lib/types';
import {SiteNav,SiteFooter} from '../../components/site-nav';
import {PlaygroundIcon} from '../../components/playground-icon';
import {ReportTable} from '../../components/report-table';
import {FileText,Globe,Lock} from 'lucide-react';
export const dynamic='force-dynamic';
type Props={params:Promise<{token:string}>};
type SharedReportSource={guild:{name:string;icon?:string|null};type:ReportType;filters:ReportFilters;state:LootState};
async function sourceFor(token:string){
  if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(404,'This shared report is unavailable.');
  const source=await database<SharedReportSource>('report_share_view',undefined,undefined,{tokenHash:await tokenHash(token)});
  const filters=reportFilterSchema.safeParse(source.filters);
  if(!filters.success||!Object.hasOwn(reportTitles,source.type))throw new ApiError(404,'This shared report is unavailable.');
  return {...source,filters:filters.data};
}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {token}=await params;let title='Shared playground report',description='View a publicly shared NAOL report.';
  try{const source=await sourceFor(token);title=`${reportTitles[source.type]} — ${source.guild.name}`;description=`A public ${reportTitles[source.type].toLowerCase()} from ${source.guild.name}. View the filtered ledger report on NAOL.`;}catch{}
  const url=/^[a-f0-9]{64}$/.test(token)?`https://naol.lokwensio.com/shared-reports/${token}`:undefined;
  return {title,description,robots:{index:false,follow:false},referrer:'no-referrer',alternates:{canonical:url},openGraph:{title:`${title} | NAOL`,description,url,type:'website',images:[{url:'https://naol.lokwensio.com/brand/naol-logo.png',width:1440,height:1094,alt:'NAOL'}]},twitter:{card:'summary_large_image',title:`${title} | NAOL`,description,images:['https://naol.lokwensio.com/brand/naol-logo.png']}};
}
export default async function SharedReport({params}:Props){
  const {token}=await params;let source:SharedReportSource|null=null,error='';
  try{source=await sourceFor(token);}catch(e){error=e instanceof ApiError?e.message:'This report could not load. Please try again.';}
  const report=source?buildReport(source.state,source.type,source.filters,source.guild.name):null;
  const scope=source?reportScope(source.filters,source.state.members.find(m=>m.id===source?.filters.member)?.name):[];
  return <main className="marketing shared-report-page"><SiteNav/><section className="shared-report-container">{report&&source?<><header className="shared-run-heading"><div className="shared-run-playground"><PlaygroundIcon icon={source.guild.icon} name={source.guild.name}/><span>{source.guild.name}</span></div><span className="shared-run-access"><Globe size={14}/>Public report · Read only</span><h1>{report.title}</h1><p>Current records within the filters saved when this link was generated.</p><small>Updated {new Date(report.generatedAt).toLocaleString('en-US',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'})} · Singapore time</small></header><div className="report-scope"><strong><FileText size={15}/>Shared report scope</strong><p>{scope.length?scope.join(' · '):'All records for this report in this playground.'}</p></div><section className="shared-saved-filters" aria-label="Saved report filters"><div className="shared-filter-heading"><Lock size={14}/><strong>Filters saved in this link</strong></div><div className="report-filters"><label>Search<input readOnly value={source.filters.search||'All records'}/></label><label>From date<input readOnly value={source.filters.from||'Any date'}/></label><label>To date<input readOnly value={source.filters.to||'Any date'}/></label><label>Dungeon<input readOnly value={source.filters.dungeon||'All dungeons'}/></label><label>Member<input readOnly value={source.filters.member?(source.state.members.find(m=>m.id===source.filters.member)?.name||'Selected member'):'All members'}/></label>{source.type!=='sales'&&<label>Loot status<input readOnly value={({'':'All statuses',available:'Has available loot','sold-out':'Sold out',partial:'Partially sold',unsold:'Unsold'} as Record<string,string>)[source.filters.status]}/></label>}</div><p>These filters define which records this public link can show. Searching below only narrows these shared results.</p></section><ReportTable report={report} publicView/></>:<section className="portal-card shared-run-unavailable"><Lock size={30}/><h1>Shared report unavailable</h1><p role="status">{error}</p><a className="lm-text-link" href="/">Back to NAOL →</a></section>}</section><SiteFooter/></main>;
}
