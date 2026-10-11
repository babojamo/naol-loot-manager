import type {LootState,Sale,DungeonRun} from './types';

type ResolvedSaleAllocation = { runLootId: string; quantity: number };

export function resolveSaleAllocations(state: LootState) {
  const lots = state.runs.flatMap((run) => run.loots.map((loot) => ({
    run,
    loot,
    remaining: loot.quantity,
  })));
  const lotById = new Map(lots.map((lot) => [lot.loot.id, lot]));
  const allocationsBySale = new Map<string, ResolvedSaleAllocation[]>();
  const recipientOverlap = (sale: Sale, run: DungeonRun) => {
    const recipients = new Set(sale.recipientIds);
    return run.memberIds.reduce((total, memberId) => total + (recipients.has(memberId) ? 1 : 0), 0);
  };

  [...state.sales]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .forEach((sale) => {
      const lootKey = sale.lootName.trim().toLowerCase();
      let requested = Math.max(0, sale.quantity);
      const resolved: ResolvedSaleAllocation[] = [];
      const candidates = () => lots.filter((lot) => lot.remaining > 0 && lot.loot.name.trim().toLowerCase() === lootKey);
      const bestOverlap = () => candidates().reduce((best, lot) => Math.max(best, recipientOverlap(sale, lot.run)), 0);

      for (const allocation of sale.allocations ?? []) {
        const lot = lotById.get(allocation.runLootId);
        if (!lot || lot.remaining <= 0 || lot.loot.name.trim().toLowerCase() !== lootKey || requested <= 0) continue;
        // Older database allocations were date-based. Ignore a zero-party match when
        // another unsold run contains the members who were actually paid.
        if (recipientOverlap(sale, lot.run) === 0 && bestOverlap() > 0) continue;
        const quantity = Math.min(requested, lot.remaining, Math.max(0, allocation.quantity));
        if (quantity <= 0) continue;
        resolved.push({ runLootId: lot.loot.id, quantity });
        lot.remaining -= quantity;
        requested -= quantity;
      }

      const fallbackLots = candidates().sort((left, right) => {
        const overlapDifference = recipientOverlap(sale, right.run) - recipientOverlap(sale, left.run);
        if (overlapDifference !== 0) return overlapDifference;
        return new Date(left.run.createdAt).getTime() - new Date(right.run.createdAt).getTime();
      });
      for (const lot of fallbackLots) {
        if (requested <= 0) break;
        const quantity = Math.min(requested, lot.remaining);
        if (quantity <= 0) continue;
        resolved.push({ runLootId: lot.loot.id, quantity });
        lot.remaining -= quantity;
        requested -= quantity;
      }
      allocationsBySale.set(sale.id, resolved);
    });

  return allocationsBySale;
}

export function soldQuantitiesByRunLoot(state: LootState) {
  const soldByLoot = new Map<string, number>();
  const runIdByLootId = new Map(state.runs.flatMap((run) => run.loots.map((loot) => [loot.id, run.id] as const)));
  for (const allocations of resolveSaleAllocations(state).values()) {
    allocations.forEach((allocation) => {
      const runId = runIdByLootId.get(allocation.runLootId);
      if (!runId) return;
      const key = `${runId}:${allocation.runLootId}`;
      soldByLoot.set(key, (soldByLoot.get(key) ?? 0) + allocation.quantity);
    });
  }
  return soldByLoot;
}

