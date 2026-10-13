import type {LootState,DungeonRun} from './types';
import {resolveSaleAllocations,soldQuantitiesByRunLoot} from './sale-allocations';
export type ReportType='inventory'|'sales'|'runs'|'drops';
export type ReportFilters={search:string;from:string;to:string;dungeon:string;member:string;status:string};
export const emptyReportFilters:ReportFilters={search:'',from:'',to:'',dungeon:'',member:'',status:''};
export const reportTitles:Record<ReportType,string>={inventory:'Inventory Report',sales:'Sales Report',runs:'Dungeon Runs Report',drops:'Drop List Report'};
export type ReportColumn={key:string;label:string;kind?:'money'|'date'|'number'|'status'};
export type ReportRow={id:string;cells:Record<string,string|number>};
export type ReportModel={type:ReportType;title:string;playground:string;generatedAt:string;columns:ReportColumn[];rows:ReportRow[];summary:{label:string;value:number;money?:boolean}[];note:string};
const key=(s:string)=>s.trim().toLowerCase();
const day=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?'':new Date(d.getTime()+8*60*60*1000).toISOString().slice(0,10);};
const inDates=(date:string,f:ReportFilters)=>{const d=day(date);return (!f.from||d>=f.from)&&(!f.to||d<=f.to);};
const statusFor=(sold:number,remaining:number)=>remaining<=0?'Sold out':sold>0?'Partially sold':'Unsold';
const statusMatches=(sold:number,remaining:number,f:ReportFilters)=>!f.status||(f.status==='available'?remaining>0:f.status==='sold-out'?remaining<=0:f.status==='partial'?sold>0&&remaining>0:sold===0);
const textMatches=(values:(string|number)[],f:ReportFilters)=>!f.search||values.join(' ').toLowerCase().includes(key(f.search));
export function buildReport(state:LootState,type:ReportType,filters:ReportFilters,playground:string):ReportModel{
  const f={...emptyReportFilters,...filters};const sold=soldQuantitiesByRunLoot(state),allocations=resolveSaleAllocations(state);
  const names=(ids:string[])=>ids.map(id=>state.members.find(m=>m.id===id)?.name??'Unknown').join(', ');
  const runMatches=(run:DungeonRun)=>inDates(run.createdAt,f)&&(!f.dungeon||run.dungeon===f.dungeon)&&(!f.member||run.memberIds.includes(f.member));
  const runs=[...state.runs].filter(runMatches).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const getPrice=(name:string)=>Object.entries(state.vendingPrices??{}).find(([n])=>key(n)===key(name))?.[1]??0;
  let columns:ReportColumn[]=[],rows:ReportRow[]=[],summary:ReportModel['summary']=[],note='Dates and times use Singapore time. Shared reports reflect current records within the saved filters.';
  if(type==='inventory'){
    columns=[{key:'item',label:'Item name'},{key:'collected',label:'Collected',kind:'number'},{key:'sold',label:'Sold',kind:'number'},{key:'available',label:'Available',kind:'number'},{key:'price',label:'Vending / piece',kind:'money'},{key:'value',label:'Available value',kind:'money'},{key:'status',label:'Status',kind:'status'}];
    const stock=new Map<string,{name:string;quantity:number;sold:number}>();
    for(const run of runs)for(const loot of run.loots){const id=key(loot.name),entry=stock.get(id)??{name:loot.name,quantity:0,sold:0};entry.quantity+=loot.quantity;entry.sold+=sold.get(`${run.id}:${loot.id}`)??0;stock.set(id,entry);}
    rows=[...stock].sort((a,b)=>a[1].name.localeCompare(b[1].name)).flatMap(([id,item])=>{const available=Math.max(0,item.quantity-item.sold);if(!statusMatches(item.sold,available,f)||!textMatches([item.name],f))return [];const price=getPrice(item.name);return [{id,cells:{item:item.name,collected:item.quantity,sold:item.sold,available,price,value:price*available,status:statusFor(item.sold,available)}}];});
    summary=[{label:'Item types',value:rows.length},{label:'Available pieces',value:rows.reduce((n,r)=>n+Number(r.cells.available),0)},{label:'Available vending value',value:rows.reduce((n,r)=>n+Number(r.cells.value),0),money:true}];
    note='Inventory date, dungeon and member filters select the originating runs. Sold and available quantities reflect the current status of those drops; vending prices are current asking prices.';
  }else if(type==='sales'){
    columns=[{key:'date',label:'Sale date',kind:'date'},{key:'item',label:'Item name'},{key:'quantity',label:'Quantity sold',kind:'number'},{key:'price',label:'Actual price / piece',kind:'money'},{key:'total',label:'Sale total',kind:'money'},{key:'runs',label:'Dungeon runs'},{key:'members',label:'Paid members'},{key:'by',label:'Recorded by'}];
    const lotRun=new Map(state.runs.flatMap(run=>run.loots.map(loot=>[loot.id,run] as const)));
    rows=[...state.sales].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).flatMap(sale=>{
      const sourceRuns=[...new Map((allocations.get(sale.id)??[]).map(a=>lotRun.get(a.runLootId)).filter((r):r is DungeonRun=>Boolean(r)).map(r=>[r.id,r])).values()];
      if(!inDates(sale.createdAt,f)||(f.member&&!sale.recipientIds.includes(f.member))||(f.dungeon&&!sourceRuns.some(r=>r.dungeon===f.dungeon)))return [];
      const members=names(sale.recipientIds),runNames=sourceRuns.map(r=>`${r.dungeon} · ${day(r.createdAt)} · #${r.id.slice(0,8)}`).join('\n');
      if(!textMatches([sale.lootName,members,runNames,sale.createdBy??''],f))return [];
      return [{id:sale.id,cells:{date:sale.createdAt,item:sale.lootName,quantity:sale.quantity,price:sale.unitPrice,total:sale.total,runs:runNames||'Not linked',members,by:sale.createdBy??'Unknown'}}];
    });
    summary=[{label:'Recorded sales',value:rows.length},{label:'Pieces sold',value:rows.reduce((n,r)=>n+Number(r.cells.quantity),0)},{label:'Actual sale total',value:rows.reduce((n,r)=>n+Number(r.cells.total),0),money:true}];
    note='Sales dates filter the sale date. Rows show complete recorded transactions, including all their paid members; a dungeon or member filter selects matching transactions.';
  }else if(type==='runs'){
    columns=[{key:'date',label:'Run date',kind:'date'},{key:'run',label:'Run reference'},{key:'dungeon',label:'Dungeon'},{key:'members',label:'Party members'},{key:'loots',label:'Loot recorded'},{key:'quantity',label:'Drop quantity',kind:'number'},{key:'sold',label:'Sold',kind:'number'},{key:'pending',label:'Pending',kind:'number'},{key:'status',label:'Status',kind:'status'},{key:'by',label:'Recorded by'}];
    rows=runs.flatMap(run=>{const quantity=run.loots.reduce((n,l)=>n+l.quantity,0),quantitySold=run.loots.reduce((n,l)=>n+(sold.get(`${run.id}:${l.id}`)??0),0),pending=Math.max(0,quantity-quantitySold),members=names(run.memberIds),loots=run.loots.map(l=>`${l.quantity} × ${l.name}`).join('\n');
      if(!statusMatches(quantitySold,pending,f)||!textMatches([run.dungeon,members,loots,run.createdBy??'',run.id.slice(0,8)],f))return [];
      return [{id:run.id,cells:{date:run.createdAt,run:'#'+run.id.slice(0,8),dungeon:run.dungeon,members,loots,quantity,sold:quantitySold,pending,status:statusFor(quantitySold,pending),by:run.createdBy??'Unknown'}}];});
    summary=[{label:'Dungeon runs',value:rows.length},{label:'Drop pieces',value:rows.reduce((n,r)=>n+Number(r.cells.quantity),0)},{label:'Pending pieces',value:rows.reduce((n,r)=>n+Number(r.cells.pending),0)}];
  }else{
    columns=[{key:'date',label:'Run date',kind:'date'},{key:'run',label:'Run reference'},{key:'dungeon',label:'Dungeon'},{key:'item',label:'Item name'},{key:'quantity',label:'Drop quantity',kind:'number'},{key:'sold',label:'Sold',kind:'number'},{key:'pending',label:'Pending',kind:'number'},{key:'status',label:'Status',kind:'status'},{key:'members',label:'Party members'}];
    rows=runs.flatMap(run=>run.loots.flatMap(loot=>{const quantitySold=sold.get(`${run.id}:${loot.id}`)??0,pending=Math.max(0,loot.quantity-quantitySold),members=names(run.memberIds);
      if(!statusMatches(quantitySold,pending,f)||!textMatches([loot.name,run.dungeon,members,run.id.slice(0,8)],f))return [];
      return [{id:run.id+':'+loot.id,cells:{date:run.createdAt,run:'#'+run.id.slice(0,8),dungeon:run.dungeon,item:loot.name,quantity:loot.quantity,sold:quantitySold,pending,status:statusFor(quantitySold,pending),members}}];}));
    summary=[{label:'Drop entries',value:rows.length},{label:'Drop pieces',value:rows.reduce((n,r)=>n+Number(r.cells.quantity),0)},{label:'Dungeon runs',value:new Set(rows.map(r=>r.cells.run)).size}];
    note='One row per loot entry, grouped by its dungeon run. Quantities show what dropped in that run and how many pieces remain unsold.';
  }
  return {type,title:reportTitles[type],playground,generatedAt:new Date().toISOString(),columns,rows,summary,note};
}
