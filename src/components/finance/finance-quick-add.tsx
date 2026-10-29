"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/finance/forms";

export function FinanceQuickAdd() {
  const sp = useSearchParams();
  const [open, setOpen] = useState<"income" | "expense" | null>(() => {
    const n = sp.get("new");
    return n === "expense" || n === "income" ? n : null;
  });
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen("income")}><Plus /> Income</Button>
      <Button size="sm" variant="accent" onClick={() => setOpen("expense")}><Plus /> Expense</Button>
      {open ? <TransactionDialog open onOpenChange={(o) => !o && setOpen(null)} defaults={{ type: open }} /> : null}
    </div>
  );
}
