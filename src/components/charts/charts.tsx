"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";

/** Categorical colours in fixed order (CSS vars, so light/dark each use their validated steps). */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular text-foreground">{formatMoney(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

const compact = (c: string) => (v: number) => formatMoney(v, c, { compact: true });

/** Monthly income vs expenditure (grouped bars, one currency, one axis). */
export function IncomeExpenseChart({ data, currency, height = 240 }: { data: { label: string; income: number; expense: number }[]; currency: string; height?: number }) {
  return (
    <figure>
      <Legend items={[{ label: "Income", color: SERIES[0] }, { label: "Expenses", color: SERIES[1] }]} />
      <div style={{ height }} role="img" aria-label={`Monthly income versus expenses in ${currency}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={56} tickFormatter={compact(currency)} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<TooltipBox currency={currency} />} />
            <Bar dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expense" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Net cash flow trend (single series line). */
export function NetLineChart({ data, currency, height = 200 }: { data: { label: string; net: number }[]; currency: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Net cash flow trend in ${currency}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={56} tickFormatter={compact(currency)} />
          <Tooltip content={<TooltipBox currency={currency} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
          <Line isAnimationActive={false} dataKey="net" name="Net" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Spending by category as horizontal bars (magnitude by length, one hue —
 * more readable than a pie and needs no categorical legend).
 */
export function CategoryBars({ data, currency }: { data: { name: string; value: number }[]; currency: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2" aria-label={`Spending by category in ${currency}`}>
      {data.map((d) => (
        <li key={d.name} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground" title={d.name}>{d.name}</span>
          <span className="h-2.5 rounded-r bg-muted" title={`${d.name}: ${formatMoney(d.value, currency)}`}>
            <span className="block h-full rounded-r" style={{ width: `${(d.value / max) * 100}%`, background: SERIES[1] }} />
          </span>
          <span className="tabular font-medium">{formatMoney(d.value, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Budget vs actual: horizontal bars of spent with the limit marked. */
export function BudgetVsActualChart({ data, height }: { data: { name: string; budget: number; actual: number; currency: string }[]; height?: number }) {
  const h = height ?? Math.max(120, data.length * 44 + 40);
  const currency = data[0]?.currency ?? "USD";
  return (
    <figure>
      <Legend items={[{ label: "Budget", color: SERIES[0] }, { label: "Actual spend", color: SERIES[1] }]} />
      <div style={{ height: h }} role="img" aria-label="Budget versus actual spending">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" barGap={2} margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" {...axis} tickFormatter={compact(currency)} />
            <YAxis type="category" dataKey="name" {...axis} width={100} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<TooltipBox currency={currency} />} />
            <Bar dataKey="budget" name="Budget" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="actual" name="Actual spend" radius={[0, 4, 4, 0]} maxBarSize={14}>
              {data.map((d) => <Cell key={d.name} fill={d.actual > d.budget ? "var(--destructive)" : SERIES[1]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-[11px] text-muted-foreground">Red bars mark budgets that are exceeded (also listed in the table).</figcaption>
    </figure>
  );
}

/** Simple count bars (e.g. task completion per week). */
export function CountBars({ data, series, height = 200 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; height?: number }) {
  return (
    <figure>
      {series.length > 1 ? <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES[i] }))} /> : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={32} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
