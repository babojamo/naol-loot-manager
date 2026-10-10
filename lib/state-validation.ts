import { z } from 'zod';
const id = z.string().min(1).max(100);
const amount = z.number().finite().nonnegative().max(1e15);
const date = z.string().datetime({ offset: true });
export const stateSchema = z.object({
  members: z.array(z.object({ id, name: z.string().trim().min(1).max(80), active: z.boolean() })).max(5000),
  runs: z.array(z.object({ id, dungeon: z.string().trim().min(1).max(100), createdAt: date, memberIds: z.array(id).min(1).max(100), loots: z.array(z.object({ id, name: z.string().trim().min(1).max(120), quantity: z.number().int().positive().max(1e9) })).min(1).max(100), createdBy: z.string().max(200).optional() })).max(5000),
  sales: z.array(z.object({ id, lootName: z.string().trim().min(1).max(120), quantity: z.number().int().positive().max(1e9), unitPrice: amount, total: amount, recipientIds: z.array(id).min(1).max(5000), salaryEach: amount, recipientAmounts: z.record(amount).optional(), allocations: z.array(z.object({ runLootId: id, quantity: z.number().int().positive().max(1e9) })).max(5000).optional(), createdAt: date, createdBy: z.string().max(200).optional() })).max(5000),
  vendingPrices: z.record(amount), lootImages: z.record(z.string().max(250000)), payoutQueue: z.array(id).max(5000),
  auditLog: z.array(z.object({ id, username: z.string().max(200), action: z.string().max(200), createdAt: date })).max(100),
  lastUpdatedAt: date.optional(), lastUpdatedBy: z.string().max(200).optional(),
}).superRefine((state, ctx) => {
  const all = [state.members.map(m => m.id),state.runs.map(r => r.id),state.sales.map(s => s.id),state.runs.flatMap(r => r.loots.map(l => l.id))];
  if (all.some(ids => new Set(ids).size !== ids.length)) ctx.addIssue({ code:'custom',message:'Duplicate record identifiers.' });
  const members = new Set(state.members.map(m => m.id));
  const parties = [...state.runs.map(r => r.memberIds),...state.sales.map(s => s.recipientIds),state.payoutQueue];
  if (parties.some(ids => new Set(ids).size !== ids.length || ids.some(id => !members.has(id)))) ctx.addIssue({ code:'custom',message:'A party contains an invalid or duplicate member.' });
  const lootIds = new Set(state.runs.flatMap(r => r.loots.map(l => l.id)));
  if (state.sales.some(s => s.allocations?.some(a => !lootIds.has(a.runLootId)))) ctx.addIssue({ code:'custom',message:'A sale refers to an unknown loot record.' });
  if (Object.values(state.lootImages).some(image => !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) ctx.addIssue({code:'custom',message:'Use an uploaded PNG, JPEG or WebP loot photo.'});
});
