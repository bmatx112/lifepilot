"use client";
import { usePathname, useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useLookups } from "@/components/layout/lookups";
import { toCsv } from "@/lib/csv";

export function ReportFilters({ from, to, scope, category, type, currency, currencies }: { from: string; to: string; scope: string; category: string; type: string; currency: string; currencies: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { businesses, categories } = useLookups();
  return (
    <form className="no-print grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 shadow-card sm:grid-cols-4 lg:grid-cols-7"
      onSubmit={(e) => { e.preventDefault(); const qs = new URLSearchParams(); new FormData(e.currentTarget).forEach((v, k) => { if (typeof v === "string" && v) qs.set(k, v); }); router.push(`${pathname}?${qs}`); }}>
      <label className="text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} /></label>
      <label className="text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={to} /></label>
      <label className="text-xs text-muted-foreground">Scope<Select name="scope" defaultValue={scope}><option value="all">Consolidated</option><option value="personal">Personal</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></label>
      <label className="text-xs text-muted-foreground">Category<Select name="category" defaultValue={category}><option value="">All</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      <label className="text-xs text-muted-foreground">Type<Select name="type" defaultValue={type}><option value="">Income & expense</option><option value="income">Income</option><option value="expense">Expense</option></Select></label>
      <label className="text-xs text-muted-foreground">Chart currency<Select name="currency" defaultValue={currency}>{currencies.map((c) => <option key={c}>{c}</option>)}</Select></label>
      <div className="flex items-end"><Button type="submit" size="sm" className="w-full">Apply</Button></div>
    </form>
  );
}

export function ReportActions({ csvName, tables, exportHref }: { csvName: string; tables: { title: string; headers: string[]; rows: (string | number)[][] }[]; exportHref: string }) {
  const download = () => {
    const parts = tables.map((t) => `${t.title}\r\n${toCsv(t.headers, t.rows)}`);
    const blob = new Blob([parts.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = csvName;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={download}><Download /> Report CSV</Button>
      <a href={exportHref} className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted"><Download className="size-4" /> Transactions CSV</a>
      <Button size="sm" variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
    </div>
  );
}
