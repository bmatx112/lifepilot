import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetStatus, periodRange } from "@/lib/finance";
import { formatCents } from "@/lib/money";
import { todayInTz } from "@/lib/dates";
import { notify } from "@/lib/notify";
import type { Budget, NotificationPreferences, Transaction } from "@/lib/types";

/**
 * Re-evaluates the user's active budgets and raises a notification the first
 * time each configured threshold is crossed in a period (deduplicated).
 * Returns human-readable warnings for immediate display.
 */
export async function checkBudgetAlerts(supabase: SupabaseClient, userId: string, tz: string, onlyCurrency?: string) {
  const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).single();
  let q = supabase.from("budgets").select("*").eq("user_id", userId).eq("active", true);
  if (onlyCurrency) q = q.eq("currency", onlyCurrency);
  const { data: budgets } = await q;
  if (!budgets?.length) return [] as string[];

  const today = todayInTz(tz);
  const earliest = (budgets as Budget[]).map((b) => periodRange(b.period, today).start).sort()[0];
  const { data: txs } = await supabase
    .from("transactions")
    .select("type, amount, currency, category_id, business_id, occurred_on")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("occurred_on", earliest);

  const warnings: string[] = [];
  for (const b of budgets as Budget[]) {
    const st = budgetStatus(b, (txs ?? []) as Transaction[], today);
    if (st.crossedThreshold === null) continue;
    const msg =
      st.level === "exceeded"
        ? `Budget "${b.name}" exceeded: ${formatCents(st.spentCents, b.currency)} of ${formatCents(st.limitCents, b.currency)} (${Math.round(st.percent)}%)`
        : `Budget "${b.name}" at ${Math.round(st.percent)}%: ${formatCents(st.remainingCents, b.currency)} left`;
    warnings.push(msg);
    if ((prefs as NotificationPreferences | null)?.budget_alerts_enabled === false) continue;
    await notify(
      supabase,
      {
        userId,
        kind: "budget",
        title: st.level === "exceeded" ? `Budget exceeded: ${b.name}` : `Budget alert: ${b.name}`,
        body: msg,
        url: "/finance/budgets",
        entityType: "budget",
        entityId: b.id,
        dedupeKey: `budget:${b.id}:${st.periodStart}:${st.crossedThreshold}`,
      },
      { prefs: prefs as NotificationPreferences, tz },
    );
  }
  return warnings;
}
