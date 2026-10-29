import { requireUser } from "@/lib/auth";
import { getBudgetStatuses } from "@/lib/data/overview";
import { todayInTz } from "@/lib/dates";
import { BudgetsView } from "@/components/finance/budgets-view";
import type { Budget } from "@/lib/types";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const { supabase, user, profile } = await requireUser();
  const today = todayInTz(profile.timezone);
  const [statuses, { data: all }] = await Promise.all([
    getBudgetStatuses(supabase, user.id, today),
    supabase.from("budgets").select("*").eq("user_id", user.id).order("name"),
  ]);
  const paused = ((all ?? []) as Budget[]).filter((b) => !b.active);
  return <BudgetsView statuses={statuses} paused={paused} />;
}
