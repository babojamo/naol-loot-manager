import type {LootState} from './types';
import {soldQuantitiesByRunLoot} from './sale-allocations';
import {lootImageFor} from './loot-images';
export type SharedRunSource={guild:{name:string;icon?:string|null};runId:string;state:LootState;restricted:boolean};
export function projectSharedRun(source:SharedRunSource){
  const run=source.state.runs.find(r=>r.id===source.runId);
  if(!run)return null;
  const sold=soldQuantitiesByRunLoot(source.state);
  return {playground:source.guild.name,icon:source.guild.icon??null,restricted:source.restricted,
    dungeon:run.dungeon,date:run.createdAt,createdBy:run.createdBy??'Unknown',
    members:run.memberIds.map(id=>source.state.members.find(m=>m.id===id)?.name??'Unknown'),
    loots:run.loots.map(loot=>{
      const quantitySold=Math.min(loot.quantity,sold.get(`${run.id}:${loot.id}`)??0);
      const price=Object.entries(source.state.vendingPrices??{}).find(([name])=>name.trim().toLowerCase()===loot.name.trim().toLowerCase())?.[1];
      return {name:loot.name,quantity:loot.quantity,sold:quantitySold,available:Math.max(0,loot.quantity-quantitySold),
        image:lootImageFor(source.state.lootImages??{},loot.name),vendingPrice:typeof price==='number'?price:null};
    })};
}
export type SharedRun=NonNullable<ReturnType<typeof projectSharedRun>>;
