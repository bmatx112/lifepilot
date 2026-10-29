import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, PiggyBank, Scale } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { applyScope, parseScope } from "@/lib/data/scope";
import { getBudgetStatuses } from "@/lib/data/overview";
import { currenciesIn, expensesByCategory, lastMonths, monthlySeries, monthRange, outstandingCents, summarize } from "@/lib/finance";
import { addDaysToDateString, todayInTz } from "@/lib/dates";
import { formatCents, fromCents } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress, Stat } from "@/components/ui/misc";
import { Totals } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { IncomeExpenseChart, CategoryBars } from "@/components/charts/charts";
import { ScopeFilter } from "@/components/finance/scope-filter";
import { FinanceQuickAdd } from "@/components/finance/finance-quick-add";
import type { Bill, Category, Transaction } from "@/lib/types";

export const metadata = { title: "Finance" };

export default async function FinanceOverview({ searchParams }: PageProps<"/finance">) {
  const sp = await searchParams;
  const scope = parseScope(sp.scope);
  const { supabase, user, profile } = await requireUser();
  const today = todayInTz(profile.timezone);
  const months = lastMonths(today.slice(0, 7), 6);
  const { start: mStart, end: mEnd } = monthRange(today);

  const [txRes, catRes, billRes, budgets] = await Promise.all([
    applyScope(supabase.from("transactions").select("type, amount, currency, category_id, business_id, occurred_on").eq("user_id", user.id).gte("occurred_on", `${months[0]}-01`), scope).limit(20000),
    supabase.from("categories").select("*").eq("user_id", user.id),
    applyScope(supabase.from("bills").select("*").eq("user_id", user.id).eq("status", "open").lte("due_date", addDaysToDateString(today, 30)).order("due_date"), scope),
    getBudgetStatuses(supabase, user.id, today),
  ]);
  const txs = (txRes.data ?? []) as Transaction[];
  const monthTx = txs.filter((t) => t.occurred_on >= mStart && t.occurred_on < mEnd);
  const sum = summarize(monthTx);
  const currencies = currenciesIn(summarize(txs));
  const primary = currencies.includes(profile.default_currency) ? profile.default_currency : currencies[0] ?? profile.default_currency;
  const cats = new Map(((catRes.data ?? []) as Category[]).map((c) => [c.id, c]));
  const scopedBudgets = budgets.filter((b) => scope.mode === "all" || (scope.mode === "personal" ? !b.budget.business_id : b.budget.business_id === scope.id));
  const budgetTotals: Record<string, { limit: number; spent: number }> = {};
  for (const b of scopedBudgets.filter((b) => b.budget.period === "monthly" && !b.budget.category_id)) {
    const t = (budgetTotals[b.budget.currency] ??= { limit: 0, spent: 0 });
    t.limit += b.limitCents;
    t.spent += b.spentCents;
  }
  const bills = (billRes.data ?? []) as Bill[];
  const obligations: Record<string, number> = {};
  for (const b of bills.filter((b) => b.kind === "payable")) obligations[b.currency] = (obligations[b.currency] ?? 0) + outstandingCents(b);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Suspense><ScopeFilter /></Suspense>
        <FinanceQuickAdd />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="pt-4 sm:pt-5"><Stat icon={<ArrowUpRight />} label="Income this month" value={<Totals totals={sum.income} empty={formatCents(0, primary)} />} tone="positive" /></CardContent></Card>
        <Card><CardContent className="pt-4 sm:pt-5"><Stat icon={<ArrowDownRight />} label="Expenditure this month" value={<Totals totals={sum.expense} empty={formatCents(0, primary)} />} /></CardContent></Card>
        <Card><CardContent className="pt-4 sm:pt-5"><Stat icon={<Scale />} label="Net cash flow" value={<Totals totals={sum.net} signed empty={formatCents(0, primary)} />} /></CardContent></Card>
        <Card><CardContent className="pt-4 sm:pt-5">
          <Stat icon={<PiggyBank />} label="Monthly budget remaining"
            value={Object.keys(budgetTotals).length ? <span className="flex flex-col">{Object.entries(budgetTotals).map(([c, t]) => <span key={c} className={t.limit - t.spent < 0 ? "text-destructive" : ""}>{formatCents(t.limit - t.spent, c)}</span>)}</span> : "—"}
            sub={Object.keys(budgetTotals).length ? Object.entries(budgetTotals).map(([c, t]) => `of ${formatCents(t.limit, c)}`).join(", ") : <Link href="/finance/budgets" className="text-accent underline">Set an overall monthly budget</Link>} />
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Income vs expenditure</CardTitle><CardDescription>Last 6 months · {primary}{currencies.length > 1 ? ` (other currencies: ${currencies.filter((c) => c !== primary).join(", ")} — see Reports)` : ""}</CardDescription></div></CardHeader>
          <CardContent>
            {txs.length ? (
              <IncomeExpenseChart currency={primary} data={monthlySeries(txs, primary, months).map((r) => ({ label: new Date(`${r.month}-15`).toLocaleString("en", { month: "short" }), income: fromCents(r.income), expense: fromCents(r.expense) }))} />
            ) : <EmptyState title="No transactions yet" description="Record your first income or expense to see trends." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Largest expense categories</CardTitle><CardDescription>This month</CardDescription></div></CardHeader>
          <CardContent>
            {(() => {
              const rows = expensesByCategory(monthTx).slice(0, 7);
              if (!rows.length) return <EmptyState title="No expenses this month" />;
              const byCur = rows.filter((r) => r.currency === (rows[0].currency));
              return (
                <>
                  <CategoryBars currency={rows[0].currency} data={byCur.map((r) => ({ name: r.categoryId ? cats.get(r.categoryId)?.name ?? "Unknown" : "Uncategorised", value: fromCents(r.cents) }))} />
                  {rows.some((r) => r.currency !== rows[0].currency) ? <p className="mt-2 text-[11px] text-muted-foreground">Showing {rows[0].currency}; other currencies are in Reports.</p> : null}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Budgets</CardTitle><CardDescription>Current period utilisation</CardDescription></div><Link href="/finance/budgets" className="text-xs text-accent hover:underline">Manage</Link></CardHeader>
          <CardContent className="space-y-3">
            {scopedBudgets.length ? scopedBudgets.map((s) => (
              <div key={s.budget.id}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span className="font-medium">{s.budget.name} <span className="text-muted-foreground">· {s.budget.period}</span></span>
                  <span className="tabular">{formatCents(s.spentCents, s.budget.currency)} / {formatCents(s.limitCents, s.budget.currency)} {s.level !== "ok" ? <Badge tone={s.level === "exceeded" ? "danger" : "warning"}>{Math.round(s.percent)}%</Badge> : null}</span>
                </div>
                <Progress value={s.percent} tone={s.level === "exceeded" ? "danger" : s.level === "warning" ? "warning" : "accent"} label={`${s.budget.name}: ${Math.round(s.percent)}%`} />
              </div>
            )) : <EmptyState title="No budgets in this view" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Upcoming obligations</CardTitle><CardDescription>Open bills & receivables due within 30 days{Object.keys(obligations).length ? ` · to pay: ${Object.entries(obligations).map(([c, v]) => formatCents(v, c)).join(" + ")}` : ""}</CardDescription></div><Link href="/finance/bills" className="text-xs text-accent hover:underline">All</Link></CardHeader>
          <CardContent>
            {bills.length ? (
              <ul className="divide-y divide-border/60">
                {bills.slice(0, 8).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{b.title} <Badge tone={b.kind === "payable" ? "neutral" : "success"}>{b.kind === "payable" ? "pay" : "receive"}</Badge></span>
                    <span className="flex shrink-0 items-center gap-2"><span className={b.due_date < today ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{b.due_date}</span><span className="font-medium tabular">{formatCents(outstandingCents(b), b.currency)}</span></span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Nothing due in the next 30 days" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
