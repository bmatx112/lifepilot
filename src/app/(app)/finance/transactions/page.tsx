import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { applyTxFilters, parseTxFilters } from "@/lib/data/transactions";
import { summarize } from "@/lib/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Totals } from "@/components/ui/money";
import { TransactionFilters } from "@/components/finance/transaction-filters";
import { TransactionsTable } from "@/components/finance/transactions-table";
import { FinanceQuickAdd } from "@/components/finance/finance-quick-add";
import { buttonVariants } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

export const metadata = { title: "Transactions" };
const PAGE = 50;

export default async function TransactionsPage({ searchParams }: PageProps<"/finance/transactions">) {
  const sp = await searchParams;
  const f = parseTxFilters(sp);
  if (!sp.scope) f.scope = "personal";
  const { supabase, user } = await requireUser();
  const page = f.page ?? 1;
  let q = supabase.from("transactions").select("*", { count: "exact" }).eq("user_id", user.id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  q = applyTxFilters(q, f);
  let totalsQ = supabase.from("transactions").select("type, amount, currency").eq("user_id", user.id);
  totalsQ = applyTxFilters(totalsQ, f);
  const [{ data, count, error }, totals] = await Promise.all([q.range((page - 1) * PAGE, page * PAGE - 1), totalsQ.limit(50000)]);
  const sum = summarize((totals.data ?? []) as Transaction[]);
  const exportQs = new URLSearchParams(Object.entries({ ...f, page: undefined }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{count ?? 0} transaction(s)</p>
        <div className="flex gap-2">
          <a href={`/api/export/transactions?${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Export CSV</a>
          <FinanceQuickAdd />
        </div>
      </div>
      <TransactionFilters filters={f} />
      <Card>
        <CardContent className="grid grid-cols-3 gap-3 pt-4 text-sm sm:pt-5">
          <div><p className="text-xs text-muted-foreground">Income (filtered)</p><Totals totals={sum.income} className="font-semibold text-success" /></div>
          <div><p className="text-xs text-muted-foreground">Expenses (filtered)</p><Totals totals={sum.expense} className="font-semibold" /></div>
          <div><p className="text-xs text-muted-foreground">Net</p><Totals totals={sum.net} signed className="font-semibold" /></div>
        </CardContent>
      </Card>
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      <TransactionsTable rows={(data ?? []) as Transaction[]} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} />
    </div>
  );
}
