"use client";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useLookups } from "@/components/layout/lookups";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import type { TxFilters } from "@/lib/data/transactions";

export function TransactionFilters({ filters }: { filters: TxFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const { businesses, categories } = useLookups();
  return (
    <form
      className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 shadow-card sm:grid-cols-4 lg:grid-cols-8"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const qs = new URLSearchParams();
        for (const [k, v] of fd.entries()) if (typeof v === "string" && v) qs.set(k, v);
        router.push(`${pathname}?${qs}`);
      }}
    >
      <div className="relative col-span-2">
        <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={filters.q} placeholder="Search description, payee, notes" className="pl-8" aria-label="Search" />
      </div>
      <Select name="type" defaultValue={filters.type ?? ""} aria-label="Type"><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></Select>
      <Select name="scope" defaultValue={filters.scope ?? "personal"} aria-label="Scope">
        <option value="personal">Personal</option>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="all">All</option>
      </Select>
      <Select name="category" defaultValue={filters.category ?? ""} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}</Select>
      <Select name="currency" defaultValue={filters.currency ?? ""} aria-label="Currency"><option value="">All currencies</option>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
      <Input type="date" name="from" defaultValue={filters.from} aria-label="From date" />
      <Input type="date" name="to" defaultValue={filters.to} aria-label="To date" />
      <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-8 lg:justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push(pathname)}><X /> Clear</Button>
        <Button type="submit" size="sm"><Search /> Apply filters</Button>
      </div>
    </form>
  );
}
