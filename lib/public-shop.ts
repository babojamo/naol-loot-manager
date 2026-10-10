import type {LootState} from './types';
import {lootImageFor} from './loot-images';
export type ShopPlayground={name:string;slug:string;description:string;inquiries_enabled?:boolean};
export function publicShopItems(state:LootState,playground:ShopPlayground){
  const inventory=new Map<string,{name:string;collected:number;sold:number}>();
  for(const run of state.runs)for(const loot of run.loots){const key=loot.name.trim().toLowerCase();const item=inventory.get(key)??{name:loot.name.trim(),collected:0,sold:0};item.collected+=Number(loot.quantity);inventory.set(key,item);}
  for(const sale of state.sales){const item=inventory.get(sale.lootName.trim().toLowerCase());if(item)item.sold+=Number(sale.quantity);}
  return [...inventory.values()].map(item=>({name:item.name,vendingPrice:Number(Object.entries(state.vendingPrices??{}).find(([name])=>name.trim().toLowerCase()===item.name.toLowerCase())?.[1]??0),image:lootImageFor(state.lootImages,item.name),available:Math.max(0,item.collected-item.sold),playground})).sort((a,b)=>a.name.localeCompare(b.name));
}
