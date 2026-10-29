import { requireUser } from "@/lib/auth";
import { applyScope, parseScope, scopeParam } from "@/lib/data/scope";
import { getBudgetStatuses } from "@/lib/data/overview";
import { addDaysToDateString, todayInTz, fmt, startOfLocalDay, endOfLocalDay } from "@/lib/dates";
import { currenciesIn, expensesByCategory, monthlySeries, outstandingCents, summarize } from "@/lib/finance";
import { addTo, formatCents, fromCents, type CurrencyTotals } from "@/lib/money";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Totals } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { BudgetVsActualChart, CategoryBars, CountBars, IncomeExpenseChart, NetLineChart } from "@/components/charts/charts";
import { ReportActions, ReportFilters } from "@/components/reports/report-tools";
import type { Bill, Business, Category, Task, Transaction } from "@/lib/types";

export const metadata = { title: "Reports" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while ((y < ey || (y === ey && m <= em)) && out.length < 60) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100));

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const today = todayInTz(tz);
  const from = isDate(sp.from) ? sp.from : `${addDaysToDateString(`${today.slice(0, 7)}-01`, -150).slice(0, 7)}-01`;
  const to = isDate(sp.to) ? sp.to : today;
  const scope = parseScope(sp.scope, "all");
  const category = typeof sp.category === "string" ? sp.category : "";
  const type = sp.type === "income" || sp.type === "expense" ? sp.type : "";
  const lastYearFrom = `${Number(today.slice(0, 4)) - 1}-01-01`;

  let txq = supabase.from("transactions").select("type, amount, currency, category_id, business_id, occurred_on").eq("user_id", user.id).gte("occurred_on", from < lastYearFrom ? from : lastYearFrom).lte("occurred_on", to > today ? to : today);
  txq = applyScope(txq, scope);
  if (category) txq = txq.eq("category_id", category);
  if (type) txq = txq.eq("type", type);
  const [txRes, cats, biz, bills, tasks, budgets, weekly] = await Promise.all([
    txq.limit(50000),
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    supabase.from("businesses").select("*").eq("user_id", user.id).order("name"),
    applyScope(supabase.from("bills").select("*").eq("user_id", user.id).eq("status", "open").order("due_date"), scope),
    applyScope(supabase.from("tasks").select("status, due_at, completed_at, business_id, priority").eq("user_id", user.id).is("parent_task_id", null), scope).limit(10000),
    getBudgetStatuses(supabase, user.id, today),
    supabase.from("daily_briefings").select("content, briefing_date, generated_by").eq("user_id", user.id).eq("kind", "weekly").order("briefing_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const all = (txRes.data ?? []) as Transaction[];
  const inRange = all.filter((t) => t.occurred_on >= from && t.occurred_on <= to);
  const sum = summarize(inRange);
  const currencies = currenciesIn(summarize(all));
  if (!currencies.length) currencies.push(profile.default_currency);
  const currency = typeof sp.currency === "string" && currencies.includes(sp.currency) ? sp.currency : currencies.includes(profile.default_currency) ? profile.default_currency : currencies[0];
  const months = monthsBetween(from, to);
  const series = monthlySeries(inRange, currency, months).map((r) => ({ label: new Date(`${r.month}-15`).toLocaleString("en", { month: "short", year: months.length > 12 ? "2-digit" : undefined }), income: fromCents(r.income), expense: fromCents(r.expense), net: fromCents(r.net) }));
  const catName = new Map(((cats.data ?? []) as Pick<Category, "id" | "name">[]).map((c) => [c.id, c.name]));
  const byCat = expensesByCategory(inRange).filter((c) => c.currency === currency);

  // Comparisons (always computed from stored records, per currency)
  const ym = today.slice(0, 7);
  const prevMonth = addDaysToDateString(`${ym}-01`, -1).slice(0, 7);
  const lastYearMonth = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;
  const monthSum = (m: string) => summarize(all.filter((t) => t.occurred_on.startsWith(m) && t.currency === currency));
  const ytd = summarize(all.filter((t) => t.occurred_on >= `${today.slice(0, 4)}-01-01` && t.occurred_on <= today && t.currency === currency));
  const lytd = summarize(all.filter((t) => t.occurred_on >= lastYearFrom && t.occurred_on <= `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` && t.currency === currency));
  const comparisons = [
    { label: "This month", s: monthSum(ym) },
    { label: "Last month", s: monthSum(prevMonth) },
    { label: "Same month last year", s: monthSum(lastYearMonth) },
    { label: "Year to date", s: ytd },
    { label: "Last year to date", s: lytd },
  ];

  const scopedBudgets = budgets.filter((b) => b.budget.currency === currency && (scope.mode === "all" || (scope.mode === "personal" ? !b.budget.business_id : b.budget.business_id === scope.id)));
  const billRows = (bills.data ?? []) as Bill[];
  const recv: CurrencyTotals = {}, pay: CurrencyTotals = {};
  billRows.forEach((b) => addTo(b.kind === "receivable" ? recv : pay, b.currency, outstandingCents(b)));

  // Task completion: tasks due in range — completed (on time / late) vs not
  const fromTs = startOfLocalDay(from, tz), toTs = endOfLocalDay(to, tz);
  const taskRows = (tasks.data ?? []) as Pick<Task, "status" | "due_at" | "completed_at" | "business_id" | "priority">[];
  const dueInRange = taskRows.filter((t) => t.due_at && new Date(t.due_at) >= fromTs && new Date(t.due_at) < toTs && t.status !== "cancelled");
  const completed = dueInRange.filter((t) => t.status === "completed");
  const onTime = completed.filter((t) => t.completed_at && t.due_at && new Date(t.completed_at) <= new Date(t.due_at));
  const completionRate = dueInRange.length ? Math.round((completed.length / dueInRange.length) * 100) : null;
  const taskSeries = months.slice(-12).map((m) => ({
    label: new Date(`${m}-15`).toLocaleString("en", { month: "short" }),
    completed: taskRows.filter((t) => t.completed_at && todayInTz(tz, new Date(t.completed_at)).startsWith(m)).length,
    due: taskRows.filter((t) => t.due_at && todayInTz(tz, new Date(t.due_at)).startsWith(m) && t.status !== "cancelled").length,
  }));

  const businesses = (biz.data ?? []) as Business[];
  const bizRows = businesses.filter((b) => scope.mode === "all" || (scope.mode === "business" && scope.id === b.id)).map((b) => {
    const s = summarize(inRange.filter((t) => t.business_id === b.id));
    const r: CurrencyTotals = {};
    billRows.filter((x) => x.business_id === b.id && x.kind === "receivable").forEach((x) => addTo(r, x.currency, outstandingCents(x)));
    const bt = taskRows.filter((t) => t.business_id === b.id);
    return { b, s, r, open: bt.filter((t) => t.status === "pending" || t.status === "in_progress").length, overdue: bt.filter((t) => (t.status === "pending" || t.status === "in_progress") && t.due_at && new Date(t.due_at) < new Date()).length };
  });
  const upcoming = billRows.filter((b) => b.due_date <= addDaysToDateString(today, 30));
  const scopeLabel = scope.mode === "all" ? "Consolidated" : scope.mode === "personal" ? "Personal" : businesses.find((b) => b.id === scope.id)?.name ?? "Business";
  const exportQs = new URLSearchParams({ scope: scopeParam(scope), from, to, ...(category ? { category } : {}), ...(type ? { type } : {}) });

  const money = (t: CurrencyTotals) => Object.entries(t).map(([c, v]) => formatCents(v, c)).join(" + ") || "0";
  const csvTables = [
    { title: `Summary ${from} to ${to} (${scopeLabel})`, headers: ["Currency", "Income", "Expenses", "Net"], rows: currenciesIn(sum).map((c) => [c, fromCents(sum.income[c] ?? 0).toFixed(2), fromCents(sum.expense[c] ?? 0).toFixed(2), fromCents(sum.net[c] ?? 0).toFixed(2)]) },
    { title: `Monthly ${currency}`, headers: ["Month", "Income", "Expenses", "Net"], rows: monthlySeries(inRange, currency, months).map((r) => [r.month, fromCents(r.income).toFixed(2), fromCents(r.expense).toFixed(2), fromCents(r.net).toFixed(2)]) },
    { title: `Spending by category ${currency}`, headers: ["Category", "Amount"], rows: byCat.map((c) => [c.categoryId ? catName.get(c.categoryId) ?? "Unknown" : "Uncategorised", fromCents(c.cents).toFixed(2)]) },
    { title: "Budget vs actual (current period)", headers: ["Budget", "Period", "Currency", "Budget", "Actual", "Used %"], rows: scopedBudgets.map((b) => [b.budget.name, b.budget.period, b.budget.currency, fromCents(b.limitCents).toFixed(2), fromCents(b.spentCents).toFixed(2), Math.round(b.percent)]) },
    { title: "Outstanding payments", headers: ["Kind", "Title", "Due", "Currency", "Outstanding"], rows: billRows.map((b) => [b.kind, b.title, b.due_date, b.currency, fromCents(outstandingCents(b)).toFixed(2)]) },
    { title: "Business performance", headers: ["Business", "Income", "Expenses", "Net", "Receivables", "Open tasks", "Overdue tasks"], rows: bizRows.map((r) => [r.b.name, money(r.s.income), money(r.s.expense), money(r.s.net), money(r.r), r.open, r.overdue]) },
  ];

  return (
    <>
      <PageHeader title="Reports" description={`${scopeLabel} · ${from} to ${to}. All figures are calculated from your stored records; currencies are never mixed.`}
        actions={<ReportActions csvName={`lifepilot-report-${from}-${to}.csv`} tables={csvTables} exportHref={`/api/export/transactions?${exportQs}`} />} />
      <div className="space-y-4">
        <ReportFilters from={from} to={to} scope={scopeParam(scope)} category={category} type={type} currency={currency} currencies={currencies} />

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4 sm:pt-5"><p className="text-xs text-muted-foreground">Income</p><Totals totals={sum.income} className="text-lg font-semibold text-success" /></CardContent></Card>
          <Card><CardContent className="pt-4 sm:pt-5"><p className="text-xs text-muted-foreground">Expenditure</p><Totals totals={sum.expense} className="text-lg font-semibold" /></CardContent></Card>
          <Card><CardContent className="pt-4 sm:pt-5"><p className="text-xs text-muted-foreground">Net cash flow</p><Totals totals={sum.net} signed className="text-lg font-semibold" /></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><div><CardTitle>Monthly income vs expenditure</CardTitle><CardDescription>{currency}</CardDescription></div></CardHeader>
            <CardContent>{inRange.length ? <IncomeExpenseChart currency={currency} data={series} /> : <EmptyState title="No transactions in this range" />}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Spending by category</CardTitle><CardDescription>{currency}</CardDescription></div></CardHeader>
            <CardContent>{byCat.length ? <CategoryBars currency={currency} data={byCat.slice(0, 10).map((c) => ({ name: c.categoryId ? catName.get(c.categoryId) ?? "Unknown" : "Uncategorised", value: fromCents(c.cents) }))} /> : <EmptyState title="No expenses" />}</CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Net cash flow trend</CardTitle><CardDescription>{currency}</CardDescription></div></CardHeader>
            <CardContent>{inRange.length ? <NetLineChart currency={currency} data={series} /> : <EmptyState title="No data" />}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Monthly & annual comparison</CardTitle><CardDescription>{currency}</CardDescription></div></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Period</th><th className="py-1 text-right font-medium">Income</th><th className="py-1 text-right font-medium">Expenses</th><th className="py-1 text-right font-medium">Net</th></tr></thead>
                <tbody className="divide-y divide-border tabular">
                  {comparisons.map((c, i) => {
                    const inc = c.s.income[currency] ?? 0, exp = c.s.expense[currency] ?? 0, net = c.s.net[currency] ?? 0;
                    const base = i === 0 ? comparisons[1].s : i === 3 ? comparisons[4].s : null;
                    const d = base ? pct(exp, base.expense[currency] ?? 0) : null;
                    return (
                      <tr key={c.label}>
                        <td className="py-1.5">{c.label}</td>
                        <td className="py-1.5 text-right">{formatCents(inc, currency)}</td>
                        <td className="py-1.5 text-right">{formatCents(exp, currency)} {d !== null ? <Badge tone={d > 0 ? "warning" : "success"}>{d > 0 ? "+" : ""}{d}%</Badge> : null}</td>
                        <td className={`py-1.5 text-right ${net < 0 ? "text-destructive" : ""}`}>{formatCents(net, currency, { signed: true })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><div><CardTitle>Budget vs actual</CardTitle><CardDescription>Current period · {currency}</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {scopedBudgets.length ? (
              <>
                <BudgetVsActualChart data={scopedBudgets.map((b) => ({ name: b.budget.name, budget: fromCents(b.limitCents), actual: fromCents(b.spentCents), currency: b.budget.currency }))} />
                <table className="w-full self-start text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Budget</th><th className="py-1 text-right font-medium">Budget</th><th className="py-1 text-right font-medium">Actual</th><th className="py-1 text-right font-medium">Used</th></tr></thead>
                  <tbody className="divide-y divide-border tabular">{scopedBudgets.map((b) => <tr key={b.budget.id}><td className="py-1.5">{b.budget.name} <span className="text-xs text-muted-foreground">({b.budget.period})</span></td><td className="py-1.5 text-right">{formatCents(b.limitCents, b.budget.currency)}</td><td className="py-1.5 text-right">{formatCents(b.spentCents, b.budget.currency)}</td><td className="py-1.5 text-right"><Badge tone={b.level === "exceeded" ? "danger" : b.level === "warning" ? "warning" : "success"}>{Math.round(b.percent)}%</Badge></td></tr>)}</tbody>
                </table>
              </>
            ) : <EmptyState title={`No ${currency} budgets in this scope`} />}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Task completion</CardTitle><CardDescription>Tasks due {from} → {to}</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Completion rate</p><p className="text-lg font-semibold">{completionRate === null ? "—" : `${completionRate}%`}</p></div>
                <div><p className="text-xs text-muted-foreground">Completed / due</p><p className="text-lg font-semibold tabular">{completed.length} / {dueInRange.length}</p></div>
                <div><p className="text-xs text-muted-foreground">On time</p><p className="text-lg font-semibold">{completed.length ? `${Math.round((onTime.length / completed.length) * 100)}%` : "—"}</p></div>
              </div>
              <CountBars series={[{ key: "due", label: "Due" }, { key: "completed", label: "Completed" }]} data={taskSeries} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Outstanding payments</CardTitle><CardDescription>To receive: {money(recv)} · To pay: {money(pay)}</CardDescription></div></CardHeader>
            <CardContent>
              {billRows.length ? (
                <ul className="divide-y divide-border/60 text-sm">{billRows.slice(0, 12).map((b) => <li key={b.id} className="flex justify-between gap-2 py-1.5"><span className="truncate">{b.title} <Badge tone={b.kind === "receivable" ? "success" : "neutral"}>{b.kind === "receivable" ? "receive" : "pay"}</Badge></span><span className="shrink-0"><span className={`mr-2 text-xs ${b.due_date < today ? "text-destructive" : "text-muted-foreground"}`}>{b.due_date}</span><span className="font-medium tabular">{formatCents(outstandingCents(b), b.currency)}</span></span></li>)}</ul>
              ) : <EmptyState title="Nothing outstanding" />}
              <p className="mt-2 text-xs text-muted-foreground">Upcoming obligations (30 days): {upcoming.length} item(s).</p>
            </CardContent>
          </Card>
        </div>

        {bizRows.length ? (
          <Card>
            <CardHeader><div><CardTitle>Business performance</CardTitle><CardDescription>{from} → {to}. Each business&apos;s figures come only from its own records.</CardDescription></div></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Business</th><th className="py-1 font-medium">Income</th><th className="py-1 font-medium">Expenses</th><th className="py-1 font-medium">Net</th><th className="py-1 font-medium">Receivables</th><th className="py-1 font-medium">Tasks</th></tr></thead>
                <tbody className="divide-y divide-border">{bizRows.map((r) => (
                  <tr key={r.b.id}><td className="py-2 font-medium">{r.b.name}</td><td className="py-2"><Totals totals={r.s.income} /></td><td className="py-2"><Totals totals={r.s.expense} /></td><td className="py-2"><Totals totals={r.s.net} signed /></td><td className="py-2"><Totals totals={r.r} /></td><td className="py-2">{r.open} open{r.overdue ? <Badge tone="danger" className="ml-1">{r.overdue} overdue</Badge> : null}</td></tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}

        {weekly.data ? (
          <Card>
            <CardHeader><div><CardTitle>Latest weekly summary</CardTitle><CardDescription>{fmt(`${weekly.data.briefing_date}T12:00:00Z`, "UTC", "d MMM yyyy")} · {weekly.data.generated_by === "ai" ? "AI-written from your data" : "generated from your data"}</CardDescription></div></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm">{weekly.data.content}</p></CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
