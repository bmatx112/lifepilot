"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/form";
import { CategoryDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import { deleteCategory } from "@/app/actions/finance";
import type { Category } from "@/lib/types";

export function CategoriesView() {
  const { categories, businesses } = useLookups();
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const groups = [
    { title: "Expense categories", list: categories.filter((c) => c.kind === "expense") },
    { title: "Income categories", list: categories.filter((c) => c.kind === "income") },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" variant="accent" onClick={() => setEdit("new")}><Plus /> New category</Button></div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-sm font-semibold">{g.title}</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {g.list.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="size-3 rounded-full" style={{ background: c.color }} />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.business_id ? businesses.find((b) => b.id === c.business_id)?.name ?? "Business" : "All"}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Pencil /></Button>
                  <ActionButton variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} className="text-destructive" action={() => deleteCategory(c.id)}
                    confirm={{ title: `Delete “${c.name}”?`, description: "Transactions keep their amounts but become uncategorised. Budgets for this category are deleted." }} confirmLabel="Delete"><Trash2 /></ActionButton>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {edit ? <CategoryDialog open category={edit === "new" ? null : edit} onOpenChange={(o) => !o && setEdit(null)} /> : null}
    </div>
  );
}
