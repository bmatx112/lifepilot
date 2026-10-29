import { requireUser } from "@/lib/auth";
import { RecurringView } from "@/components/finance/recurring-view";
import type { RecurringTransaction } from "@/lib/types";

export const metadata = { title: "Recurring" };

export default async function RecurringPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("recurring_transactions").select("*").eq("user_id", user.id).order("active", { ascending: false }).order("next_run_on");
  return <RecurringView items={(data ?? []) as RecurringTransaction[]} />;
}
