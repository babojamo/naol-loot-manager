import type {LootState} from './types';
import {resolveSaleAllocations} from './sale-allocations';
import {lootImageFor} from './loot-images';
export type SharedRunSource={guild:{name:string;icon?:string|null};runId:string;state:LootState;restricted:boolean};
export function projectSharedRun(source:SharedRunSource){
  const run=source.state.runs.find(r=>r.id===source.runId);
  if(!run)return null;
  const allocations=resolveSaleAllocations(source.state);
  const orderedSales=[...source.state.sales].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  return {playground:source.guild.name,icon:source.guild.icon??null,restricted:source.restricted,
    dungeon:run.dungeon,date:run.createdAt,createdBy:run.createdBy??'Unknown',
    members:run.memberIds.map(id=>source.state.members.find(m=>m.id===id)?.name??'Unknown'),
    loots:run.loots.map(loot=>{
      const sales=orderedSales.flatMap(sale=>{
        const quantity=(allocations.get(sale.id)??[]).filter(a=>a.runLootId===loot.id).reduce((sum,a)=>sum+a.quantity,0);
        return quantity>0?[{quantity,unitPrice:sale.unitPrice,total:quantity*sale.unitPrice,date:sale.createdAt}]:[];
      });
      const quantitySold=Math.min(loot.quantity,sales.reduce((sum,sale)=>sum+sale.quantity,0));
      const price=Object.entries(source.state.vendingPrices??{}).find(([name])=>name.trim().toLowerCase()===loot.name.trim().toLowerCase())?.[1];
      return {name:loot.name,quantity:loot.quantity,sold:quantitySold,available:Math.max(0,loot.quantity-quantitySold),
        image:lootImageFor(source.state.lootImages??{},loot.name),vendingPrice:typeof price==='number'?price:null,
        sales,saleTotal:sales.reduce((sum,sale)=>sum+sale.total,0)};
    })};
}
export type SharedRun=NonNullable<ReturnType<typeof projectSharedRun>>;
