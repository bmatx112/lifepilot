"use client";
import { useState } from "react";
import { Pause, Pencil, Play, Plus, Repeat, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { RecurringDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import { deleteRecurring, runRecurringNow, toggleRecurring } from "@/app/actions/finance";
import { formatMoney } from "@/lib/money";
import type { RecurringTransaction } from "@/lib/types";

export function RecurringView({ items }: { items: RecurringTransaction[] }) {
  const { categories, businesses } = useLookups();
  const [edit, setEdit] = useState<RecurringTransaction | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Due entries are recorded automatically by the scheduler.</p>
        <div className="flex gap-2">
          <ActionButton size="sm" variant="outline" action={runRecurringNow}><Zap /> Record due now</ActionButton>
          <Button size="sm" variant="accent" onClick={() => setEdit("new")}><Plus /> New</Button>
        </div>
      </div>
      {items.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Repeat className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.description} {!r.active ? <Badge>paused/ended</Badge> : null}</p>
                <p className="text-xs text-muted-foreground">
                  {r.frequency} · next {r.next_run_on}{r.end_on ? ` · ends ${r.end_on}` : ""} · {r.category_id ? categories.find((c) => c.id === r.category_id)?.name : "Uncategorised"} · {r.business_id ? businesses.find((b) => b.id === r.business_id)?.name : "Personal"}
                </p>
              </div>
              <span className={`font-semibold tabular ${r.type === "income" ? "text-success" : ""}`}>{r.type === "income" ? "+" : "−"}{formatMoney(Number(r.amount), r.currency)}</span>
              <div className="flex">
                <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEdit(r)}><Pencil /></Button>
                <ActionButton variant="ghost" size="icon-sm" aria-label={r.active ? "Pause" : "Resume"} action={() => toggleRecurring(r.id, !r.active)}>{r.active ? <Pause /> : <Play />}</ActionButton>
                <ActionButton variant="ghost" size="icon-sm" aria-label="Delete" className="text-destructive" action={() => deleteRecurring(r.id)} confirm={{ title: "Delete this recurring entry?", description: "Transactions already recorded are kept." }} confirmLabel="Delete"><Trash2 /></ActionButton>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Repeat />} title="No recurring income or expenses" description="Add rent, salaries, subscriptions or retainers and they'll be recorded on schedule." />}
      {edit ? <RecurringDialog open item={edit === "new" ? null : edit} onOpenChange={(o) => !o && setEdit(null)} /> : null}
    </div>
  );
}
