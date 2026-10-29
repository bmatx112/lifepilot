import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceDate } from "@/lib/finance";
import type { RecurringTransaction } from "@/lib/types";

/**
 * Turns due recurring templates into real transactions. Idempotent: the unique
 * (recurring_id, occurred_on) index prevents duplicates if two runs overlap.
 * Pass userId to limit to one user (RLS client); omit with the admin client.
 */
export async function materializeRecurring(supabase: SupabaseClient, today: string, userId?: string) {
  let q = supabase.from("recurring_transactions").select("*, user_id").eq("active", true).lte("next_run_on", today).limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  let created = 0;
  for (const r of (data ?? []) as (RecurringTransaction & { user_id: string; is_demo: boolean })[]) {
    let next = r.next_run_on;
    let guard = 0;
    while (next <= today && (!r.end_on || next <= r.end_on) && guard++ < 60) {
      const { error } = await supabase.from("transactions").insert({
        user_id: r.user_id,
        business_id: r.business_id,
        category_id: r.category_id,
        recurring_id: r.id,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        occurred_on: next,
        description: r.description,
        payment_method: r.payment_method,
        source: "recurring",
        is_demo: r.is_demo,
      });
      if (!error) created++;
      else if (error.code !== "23505") throw new Error(error.message);
      next = advanceDate(next, r.frequency);
    }
    const ended = Boolean(r.end_on && next > r.end_on);
    await supabase.from("recurring_transactions").update({ next_run_on: next, active: !ended }).eq("id", r.id);
  }
  return created;
}
