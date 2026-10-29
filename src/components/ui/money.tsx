import { formatCents, type CurrencyTotals } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Shows per-currency totals stacked (never summed across currencies). */
export function Totals({ totals, className, empty = "—", signed }: { totals: CurrencyTotals; className?: string; empty?: string; signed?: boolean }) {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  if (!entries.length) return <span className={cn("tabular", className)}>{empty}</span>;
  return (
    <span className={cn("flex flex-col tabular", className)}>
      {entries.map(([c, v]) => (
        <span key={c} className={cn("whitespace-nowrap",signed && v < 0 && "text-destructive", signed && v > 0 && "text-success")}>{formatCents(v, c, { signed })}</span>
      ))}
    </span>
  );
}
