import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { monthRange, outstandingCents, summarize } from "@/lib/finance";
import { todayInTz } from "@/lib/dates";
import { addTo, type CurrencyTotals } from "@/lib/money";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Totals } from "@/components/ui/money";
import { NewBusinessButton } from "@/components/business/business-dialog";
import type { Bill, Business, Task, Transaction } from "@/lib/types";

export const metadata = { title: "Business" };

export default async function BusinessPage({ searchParams }: PageProps<"/business">) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const { supabase, user, profile } = await requireUser();
  const { start, end } = monthRange(todayInTz(profile.timezone));
  const [biz, tx, tasks, bills] = await Promise.all([
    supabase.from("businesses").select("*").eq("user_id", user.id).eq("archived", showArchived).order("name"),
    supabase.from("transactions").select("business_id, type, amount, currency").eq("user_id", user.id).not("business_id", "is", null).gte("occurred_on", start).lt("occurred_on", end),
    supabase.from("tasks").select("business_id, status, due_at, priority").eq("user_id", user.id).not("business_id", "is", null).in("status", ["pending", "in_progress"]),
    supabase.from("bills").select("business_id, kind, amount, amount_paid, status, currency").eq("user_id", user.id).not("business_id", "is", null).eq("status", "open"),
  ]);
  const businesses = (biz.data ?? []) as Business[];

  // Consolidated view across businesses — each business's records remain separate rows.
  const consolidated = summarize(((tx.data ?? []) as Transaction[]).filter((t) => businesses.some((b) => b.id === t.business_id)));

  return (
    <>
      <PageHeader title="Business" description="Each business keeps its own finances, tasks, meetings, contacts and documents."
        actions={<><Link href={showArchived ? "/business" : "/business?archived=1"} className="text-sm text-muted-foreground hover:underline">{showArchived ? "Active businesses" : "Archived"}</Link><NewBusinessButton /></>} />
      {businesses.length ? (
        <>
          {!showArchived && businesses.length > 1 ? (
            <Card className="mb-4"><CardContent className="grid grid-cols-3 gap-3 pt-4 text-sm sm:pt-5">
              <div><p className="text-xs text-muted-foreground">All businesses · income this month</p><Totals totals={consolidated.income} className="font-semibold text-success" /></div>
              <div><p className="text-xs text-muted-foreground">Expenses</p><Totals totals={consolidated.expense} className="font-semibold" /></div>
              <div><p className="text-xs text-muted-foreground">Net</p><Totals totals={consolidated.net} signed className="font-semibold" /></div>
            </CardContent></Card>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {businesses.map((b) => {
              const s = summarize(((tx.data ?? []) as Transaction[]).filter((t) => t.business_id === b.id));
              const bt = ((tasks.data ?? []) as Task[]).filter((t) => t.business_id === b.id);
              const recv: CurrencyTotals = {};
              ((bills.data ?? []) as Bill[]).filter((x) => x.business_id === b.id && x.kind === "receivable").forEach((x) => addTo(recv, x.currency, outstandingCents(x)));
              const overdue = bt.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;
              return (
                <Link key={b.id} href={`/business/${b.id}`} className="group rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-accent/50">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: b.color }}>{b.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate font-medium group-hover:underline">{b.name}</p><p className="truncate text-xs text-muted-foreground">{b.industry ?? "Business"} · {b.currency}</p></div>
                    {b.is_demo ? <Badge tone="warning">Demo</Badge> : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Income (month)</dt><dd className="font-medium"><Totals totals={s.income} /></dd></div>
                    <div><dt className="text-muted-foreground">Expenses</dt><dd className="font-medium"><Totals totals={s.expense} /></dd></div>
                    <div><dt className="text-muted-foreground">Owed to you</dt><dd className="font-medium"><Totals totals={recv} /></dd></div>
                  </dl>
                  <div className="mt-3 flex gap-1.5"><Badge>{bt.length} open tasks</Badge>{overdue ? <Badge tone="danger">{overdue} overdue</Badge> : null}</div>
                </Link>
              );
            })}
          </div>
        </>
      ) : <EmptyState icon={<Building2 />} title={showArchived ? "No archived businesses" : "No businesses yet"} description="Add a business or project to track its finances, tasks, meetings and documents separately from your personal life." action={!showArchived ? <NewBusinessButton /> : undefined} />}
    </>
  );
}
