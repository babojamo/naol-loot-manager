import type { LootState } from "../../../lib/types";
import { api, publicGuild, ledger } from "../../../lib/tenant";
import { lootImageFor } from "../../../lib/loot-images";

function vendingPriceFor(state: LootState, lootName: string) {
  const match = Object.entries(state.vendingPrices ?? {}).find(
    ([name]) => name.trim().toLowerCase() === lootName.trim().toLowerCase(),
  );
  return Number(match?.[1] ?? 0);
}

export async function GET(request: Request) { return api(async () => {
  const guild = await publicGuild(request);
  const state = (await ledger(guild.id)).state;
  const inventory = new Map<string, { name: string; collected: number; sold: number }>();

  state.runs.forEach((run) => run.loots.forEach((loot) => {
    const lootKey = loot.name.trim().toLowerCase();
    const item = inventory.get(lootKey) ?? { name: loot.name.trim(), collected: 0, sold: 0 };
    item.collected += Number(loot.quantity);
    inventory.set(lootKey, item);
  }));

  state.sales.forEach((sale) => {
    const item = inventory.get(sale.lootName.trim().toLowerCase());
    if (item) item.sold += Number(sale.quantity);
  });

  const items = [...inventory.values()]
    .map((item) => ({
      name: item.name,
      vendingPrice: vendingPriceFor(state, item.name),
      image: lootImageFor(state.lootImages, item.name),
      available: Math.max(0, item.collected - item.sold),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Response.json(
    { guild, items, updatedAt: state.lastUpdatedAt ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
},request); }
