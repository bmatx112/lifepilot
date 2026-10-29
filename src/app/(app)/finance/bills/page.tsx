import { requireUser } from "@/lib/auth";
import { todayInTz } from "@/lib/dates";
import { applyScope, parseScope } from "@/lib/data/scope";
import { BillsView } from "@/components/finance/bills-view";
import type { Bill } from "@/lib/types";

export const metadata = { title: "Bills & receivables" };

export default async function BillsPage({ searchParams }: PageProps<"/finance/bills">) {
  const sp = await searchParams;
  const scope = parseScope(sp.scope, "all");
  const status = sp.status === "closed" ? "closed" : "open";
  const { supabase, user, profile } = await requireUser();
  let q = supabase.from("bills").select("*").eq("user_id", user.id).order("due_date", { ascending: status === "open" });
  q = status === "open" ? q.eq("status", "open") : q.in("status", ["paid", "cancelled"]);
  const { data } = await applyScope(q, scope).limit(500);
  return <BillsView bills={(data ?? []) as Bill[]} today={todayInTz(profile.timezone)} status={status} />;
}
