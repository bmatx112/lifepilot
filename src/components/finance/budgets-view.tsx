"use client";
import { useState } from "react";
import { Pause, Pencil, Play, PiggyBank, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, Progress } from "@/components/ui/misc";
import { BudgetDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import { deleteBudget, toggleBudget } from "@/app/actions/finance";
import { formatCents } from "@/lib/money";
import { addDaysToDateString } from "@/lib/dates";
import type { BudgetStatus } from "@/lib/finance";
import type { Budget } from "@/lib/types";

export function BudgetsView({ statuses, paused }: { statuses: BudgetStatus[]; paused: Budget[] }) {
  const { categories, businesses } = useLookups();
  const [edit, setEdit] = useState<Budget | null | "new">(null);
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "Category" : "All expenses");
  const scopeName = (id: string | null) => (id ? businesses.find((b) => b.id === id)?.name ?? "Business" : "Personal");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Alerts are sent when spending crosses each threshold (once per period).</p>
        <Button size="sm" variant="accent" onClick={() => setEdit("new")}><Plus /> New budget</Button>
      </div>
      {statuses.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {statuses.map((s) => (
            <Card key={s.budget.id} className={s.level === "exceeded" ? "border-destructive/40" : s.level === "warning" ? "border-warning/40" : ""}>
              <CardContent className="space-y-3 pt-4 sm:pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.budget.name}</p>
                    <p className="text-xs text-muted-foreground">{catName(s.budget.category_id)} · {scopeName(s.budget.business_id)} · {s.budget.period}</p>
                  </div>
                  {s.level !== "ok" ? <Badge tone={s.level === "exceeded" ? "danger" : "warning"}><TriangleAlert className="size-3" />{s.level === "exceeded" ? "Exceeded" : "Approaching"}</Badge> : <Badge tone="success">On track</Badge>}
                </div>
                <div>
                  <div className="mb-1 flex items-end justify-between">
                    <span className="text-lg font-semibold tabular">{formatCents(s.spentCents, s.budget.currency)}</span>
                    <span className="text-xs text-muted-foreground tabular">of {formatCents(s.limitCents, s.budget.currency)} · {Math.round(s.percent)}%</span>
                  </div>
                  <Progress value={s.percent} tone={s.level === "exceeded" ? "danger" : s.level === "warning" ? "warning" : "accent"} label={`${Math.round(s.percent)}% used`} />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Remaining</dt><dd className={`font-medium tabular ${s.remainingCents < 0 ? "text-destructive" : ""}`}>{formatCents(s.remainingCents, s.budget.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Projected at period end</dt><dd className={`font-medium tabular ${s.projectedCents > s.limitCents ? "text-warning" : ""}`}>{formatCents(s.projectedCents, s.budget.currency)}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Period</dt><dd>{s.periodStart} → {addDaysToDateString(s.periodEnd, -1)} · alerts at {s.budget.alert_thresholds.join("%, ")}%</dd></div>
                </dl>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(s.budget)}><Pencil /> Edit</Button>
                  <ActionButton size="sm" variant="ghost" action={() => toggleBudget(s.budget.id, false)}><Pause /> Pause</ActionButton>
                  <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => deleteBudget(s.budget.id)} confirm={{ title: `Delete budget “${s.budget.name}”?`, description: "Transactions are not affected." }} confirmLabel="Delete"><Trash2 /></ActionButton>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<PiggyBank />} title="No active budgets" description="Create monthly, quarterly or annual budgets — overall or per category, for personal or business spending." action={<Button size="sm" variant="accent" onClick={() => setEdit("new")}><Plus /> Create a budget</Button>} />
      )}
      {paused.length ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paused</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {paused.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{b.name} <span className="text-muted-foreground">· {formatCents(Math.round(Number(b.amount) * 100), b.currency)} {b.period}</span></span>
                <ActionButton size="sm" variant="ghost" action={() => toggleBudget(b.id, true)}><Play /> Resume</ActionButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {edit ? <BudgetDialog open budget={edit === "new" ? null : edit} onOpenChange={(o) => !o && setEdit(null)} /> : null}
    </div>
  );
}
