import { addTo, toCents, type CurrencyTotals } from "@/lib/money";
import { addDaysToDateString, daysBetween } from "@/lib/dates";
import type { Bill, Budget, BudgetPeriod, Transaction } from "@/lib/types";

/** Inclusive start / exclusive end (yyyy-MM-dd) of the budget period containing `date`. */
export function periodRange(period: BudgetPeriod, date: string): { start: string; end: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (period === "monthly") {
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
    return { start: `${y}-${pad(m)}-01`, end };
  }
  if (period === "quarterly") {
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    const end = qStart + 3 > 12 ? `${y + 1}-01-01` : `${y}-${pad(qStart + 3)}-01`;
    return { start: `${y}-${pad(qStart)}-01`, end };
  }
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}

export function monthRange(date: string) {
  return periodRange("monthly", date);
}

export interface Summary {
  income: CurrencyTotals;
  expense: CurrencyTotals;
  net: CurrencyTotals;
  count: number;
}

/** Totals grouped by currency (cents). Never mixes currencies. */
export function summarize(txs: Pick<Transaction, "type" | "amount" | "currency">[]): Summary {
  const s: Summary = { income: {}, expense: {}, net: {}, count: txs.length };
  for (const t of txs) {
    const c = toCents(t.amount);
    if (t.type === "income") {
      addTo(s.income, t.currency, c);
      addTo(s.net, t.currency, c);
    } else {
      addTo(s.expense, t.currency, c);
      addTo(s.net, t.currency, -c);
    }
  }
  return s;
}

export function currenciesIn(summary: Summary): string[] {
  return Array.from(new Set([...Object.keys(summary.income), ...Object.keys(summary.expense)])).sort();
}

export interface CategoryTotal {
  categoryId: string | null;
  currency: string;
  cents: number;
}

export function expensesByCategory(
  txs: Pick<Transaction, "type" | "amount" | "currency" | "category_id">[],
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const key = `${t.category_id ?? "none"}|${t.currency}`;
    const cur = map.get(key) ?? { categoryId: t.category_id, currency: t.currency, cents: 0 };
    cur.cents += toCents(t.amount);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export interface BudgetStatus {
  budget: Budget;
  periodStart: string;
  periodEnd: string;
  spentCents: number;
  limitCents: number;
  remainingCents: number;
  /** 0..∞ percentage of the budget used. */
  percent: number;
  level: "ok" | "warning" | "exceeded";
  /** Highest configured threshold that has been crossed, if any. */
  crossedThreshold: number | null;
  /** Projected spend at period end assuming the current daily rate. */
  projectedCents: number;
}

/**
 * Spending against a budget: expense transactions in the same currency, the
 * same ownership scope (personal = business_id null, or a specific business),
 * and — when the budget targets a category — that category only.
 */
export function budgetStatus(
  budget: Budget,
  txs: Pick<Transaction, "type" | "amount" | "currency" | "category_id" | "business_id" | "occurred_on">[],
  today: string,
): BudgetStatus {
  const { start, end } = periodRange(budget.period, today);
  let spent = 0;
  for (const t of txs) {
    if (t.type !== "expense") continue;
    if (t.currency !== budget.currency) continue;
    if ((t.business_id ?? null) !== (budget.business_id ?? null)) continue;
    if (budget.category_id && t.category_id !== budget.category_id) continue;
    if (t.occurred_on < start || t.occurred_on >= end) continue;
    spent += toCents(t.amount);
  }
  const limit = toCents(budget.amount);
  const percent = limit > 0 ? (spent / limit) * 100 : 0;
  const thresholds = [...(budget.alert_thresholds ?? [80, 100])].sort((a, b) => a - b);
  const crossed = thresholds.filter((th) => percent >= th);
  const warnAt = thresholds[0] ?? 80;
  const totalDays = Math.max(1, daysBetween(start, end));
  const elapsed = Math.min(totalDays, Math.max(1, daysBetween(start, today) + 1));
  return {
    budget,
    periodStart: start,
    periodEnd: end,
    spentCents: spent,
    limitCents: limit,
    remainingCents: limit - spent,
    percent,
    level: percent >= 100 ? "exceeded" : percent >= warnAt ? "warning" : "ok",
    crossedThreshold: crossed.length ? crossed[crossed.length - 1] : null,
    projectedCents: Math.round((spent / elapsed) * totalDays),
  };
}

/** Outstanding amount of an open bill/receivable in cents. */
export function outstandingCents(bill: Pick<Bill, "amount" | "amount_paid" | "status">): number {
  if (bill.status !== "open") return 0;
  return Math.max(0, toCents(bill.amount) - toCents(bill.amount_paid));
}

export function billDueState(bill: Pick<Bill, "due_date" | "status">, today: string) {
  if (bill.status !== "open") return bill.status;
  const d = daysBetween(today, bill.due_date);
  if (d < 0) return "overdue" as const;
  if (d <= 7) return "due_soon" as const;
  return "upcoming" as const;
}

/** Next date for a simple frequency (weekly/monthly/quarterly/yearly), clamping month-end days. */
export function advanceDate(date: string, frequency: "weekly" | "monthly" | "quarterly" | "yearly"): string {
  if (frequency === "weekly") return addDaysToDateString(date, 7);
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  const d = Number(date.slice(8, 10));
  const ny = y + Math.floor(m / 12);
  const nm = m % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** Monthly series (yyyy-MM) of income & expense cents for one currency. */
export function monthlySeries(
  txs: Pick<Transaction, "type" | "amount" | "currency" | "occurred_on">[],
  currency: string,
  months: string[],
) {
  const rows = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  for (const t of txs) {
    if (t.currency !== currency) continue;
    const row = rows.get(t.occurred_on.slice(0, 7));
    if (!row) continue;
    if (t.type === "income") row.income += toCents(t.amount);
    else row.expense += toCents(t.amount);
  }
  return [...rows.values()].map((r) => ({ ...r, net: r.income - r.expense }));
}

/** List of yyyy-MM strings ending at `endMonth` (inclusive), `count` long. */
export function lastMonths(endMonth: string, count: number): string[] {
  const y = Number(endMonth.slice(0, 4));
  const m = Number(endMonth.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + m - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}
