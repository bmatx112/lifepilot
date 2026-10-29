import { z } from "zod";

export const txFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(["income", "expense"]).optional().catch(undefined),
  scope: z.string().optional().catch(undefined), // "personal" | business uuid | undefined (all)
  category: z.uuid().optional().catch(undefined),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(1),
});
export type TxFilters = z.infer<typeof txFilterSchema>;

export function parseTxFilters(sp: Record<string, string | string[] | undefined>): TxFilters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v === "" ? undefined : v]));
  return txFilterSchema.parse(flat);
}

export function applyTxFilters<Q>(query: Q, f: TxFilters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (f.type) q = q.eq("type", f.type);
  if (f.scope === "personal") q = q.is("business_id", null);
  else if (f.scope && z.uuid().safeParse(f.scope).success) q = q.eq("business_id", f.scope);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.currency) q = q.eq("currency", f.currency);
  if (f.from) q = q.gte("occurred_on", f.from);
  if (f.to) q = q.lte("occurred_on", f.to);
  if (f.q) {
    const term = f.q.replace(/[%,()"\\]/g, " ").trim();
    if (term) q = q.or(`description.ilike.%${term}%,counterparty.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  return q as Q;
}
