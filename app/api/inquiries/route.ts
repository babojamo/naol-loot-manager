import type { LootState } from "../../../lib/types";
import { api, publicGuild, ledger } from "../../../lib/tenant";

function soldQuantitiesByRunLoot(state: LootState) {
  const remainingSold = new Map<string, number>();
  const allocated = new Map<string, number>();
  state.sales.forEach((sale) => {
    if(sale.allocations?.length) {
      sale.allocations.forEach(a=>allocated.set(a.runLootId,(allocated.get(a.runLootId)??0)+a.quantity));
    } else {
      const key = sale.lootName.trim().toLowerCase();
      remainingSold.set(key, (remainingSold.get(key) ?? 0) + sale.quantity);
    }
  });
  const soldByLoot = new Map<string, number>();
  [...state.runs].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()).forEach((run) => run.loots.forEach((loot) => {
    const key = loot.name.trim().toLowerCase();
    const exact = Math.min(loot.quantity, allocated.get(loot.id) ?? 0);
    const fallback = Math.min(loot.quantity-exact, remainingSold.get(key) ?? 0);
    soldByLoot.set(`${run.id}:${loot.id}`, exact+fallback);
    remainingSold.set(key, Math.max(0, (remainingSold.get(key) ?? 0) - fallback));
  }));
  return soldByLoot;
}

function vendingPriceFor(state: LootState, lootName: string) {
  const match = Object.entries(state.vendingPrices ?? {}).find(([name]) => name.trim().toLowerCase() === lootName.trim().toLowerCase());
  return Number(match?.[1] ?? 0);
}

export async function GET(request: Request) { return api(async () => {
  const guild = await publicGuild(request);
  const query = new URL(request.url).searchParams.get("query")?.trim().toLowerCase().slice(0, 80) ?? "";
  if (!query) return Response.json({ guild, query, results: [] }, { headers: { "Cache-Control": "no-store" } });
  const state = (await ledger(guild.id)).state;
  const soldByLoot = soldQuantitiesByRunLoot(state);
  const queueOrder = new Map(state.payoutQueue.map((id, index) => [id, index]));
  const activeIds = new Set(state.members.filter((member) => member.active).map((member) => member.id));

  const results = state.members.map((member) => {
    const memberMatches = member.name.toLowerCase().includes(query);
    const pendingLoot = new Map<string, { name: string; quantity: number }>();
    let estimatedPendingCents = 0;
    state.runs.filter((run) => run.memberIds.includes(member.id)).forEach((run) => run.loots.forEach((loot) => {
      const quantity = loot.quantity - (soldByLoot.get(`${run.id}:${loot.id}`) ?? 0);
      if (quantity <= 0 || (!memberMatches && !loot.name.toLowerCase().includes(query))) return;
      const lootKey = loot.name.trim().toLowerCase();
      const current = pendingLoot.get(lootKey) ?? { name: loot.name.trim(), quantity: 0 };
      current.quantity += quantity;
      pendingLoot.set(lootKey, current);
      const vendingAmount = vendingPriceFor(state, loot.name);
      const party = run.memberIds.filter((id) => activeIds.has(id)).sort((left, right) => (queueOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (queueOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
      const position = party.indexOf(member.id);
      if (vendingAmount > 0 && position >= 0 && party.length > 0) {
        const lotCents = Math.round(quantity * vendingAmount * 100);
        const baseCents = Math.floor(lotCents / party.length);
        estimatedPendingCents += baseCents + (position < lotCents - baseCents * party.length ? 1 : 0);
      }
    }));

    const matchingSales = state.sales.filter((sale) => sale.recipientIds.includes(member.id)
      && (memberMatches || sale.lootName.toLowerCase().includes(query)));
    const paidLoot = new Map<string, { name: string; sales: number }>();
    matchingSales.forEach((sale) => {
      const lootKey = sale.lootName.trim().toLowerCase();
      const current = paidLoot.get(lootKey) ?? { name: sale.lootName.trim(), sales: 0 };
      current.sales += 1;
      paidLoot.set(lootKey, current);
    });
    const totalPaid = matchingSales.reduce((total, sale) => total + Number(sale.recipientAmounts?.[member.id] ?? sale.salaryEach), 0);
    return { name: member.name, memberId: member.id, memberMatches, pendingLoot: [...pendingLoot.values()], paidLoot: [...paidLoot.values()], totalPaid, estimatedPendingSalary: estimatedPendingCents / 100 };
  }).filter((result) => result.memberMatches || result.pendingLoot.length > 0 || result.paidLoot.length > 0)
    .sort((left, right) => (queueOrder.get(left.memberId) ?? Number.MAX_SAFE_INTEGER) - (queueOrder.get(right.memberId) ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name))
    .map((result) => ({ name: result.name, pendingLoot: result.pendingLoot, paidLoot: result.paidLoot, totalPaid: result.totalPaid, estimatedPendingSalary: result.estimatedPendingSalary }));

  return Response.json({ guild, query, results }, { headers: { "Cache-Control": "no-store" } });
},request); }
