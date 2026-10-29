"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Ellipsis, Paperclip, Pencil, Receipt, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { Attachments } from "@/components/ui/attachments";
import { TransactionDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import { deleteTransaction } from "@/app/actions/finance";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Attachment, Transaction } from "@/lib/types";

export function TransactionsTable({ rows, page, pages }: { rows: Transaction[]; page: number; pages: number }) {
  const { categories, businesses } = useLookups();
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [files, setFiles] = useState<{ tx: Transaction; list: Attachment[] } | null>(null);
  const pathname = usePathname();
  const sp = useSearchParams();
  const cat = new Map(categories.map((c) => [c.id, c]));
  const biz = new Map(businesses.map((b) => [b.id, b]));
  const pageHref = (p: number) => { const q = new URLSearchParams(sp.toString()); q.set("page", String(p)); return `${pathname}?${q}`; };

  const openFiles = async (tx: Transaction) => {
    const { data } = await createClient().from("attachments").select("*").eq("entity_type", "transaction").eq("entity_id", tx.id);
    setFiles({ tx, list: (data ?? []) as Attachment[] });
  };
  const remove = async (tx: Transaction) => {
    if (!window.confirm(`Delete “${tx.description}”? This cannot be undone.`)) return;
    const r = await deleteTransaction(tx.id);
    if (r.ok) toast.success(r.message); else toast.error(r.error);
  };

  if (!rows.length) return <EmptyState icon={<Receipt />} title="No transactions match" description="Adjust the filters or record a new transaction." />;
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="hidden bg-muted/60 text-left text-xs text-muted-foreground sm:table-header-group">
            <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Scope</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="w-10" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => {
              const c = t.category_id ? cat.get(t.category_id) : null;
              return (
                <tr key={t.id} className="flex flex-wrap items-center gap-x-2 px-3 py-2 sm:table-row sm:px-0 sm:py-0">
                  <td className="order-2 w-full text-xs text-muted-foreground tabular sm:order-none sm:w-28 sm:px-3 sm:py-2.5 sm:text-sm">{t.occurred_on}</td>
                  <td className="order-1 min-w-0 flex-1 sm:px-3 sm:py-2.5">
                    <p className="truncate font-medium">{t.description}</p>
                    <p className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {t.counterparty ? <span>{t.counterparty}</span> : null}
                      {t.payment_method ? <span>· {t.payment_method}</span> : null}
                      {t.source === "recurring" ? <Badge tone="info">recurring</Badge> : t.source === "bill" ? <Badge tone="info">bill</Badge> : null}
                      {t.is_demo ? <Badge tone="warning">Demo</Badge> : null}
                    </p>
                  </td>
                  <td className="order-3 hidden sm:table-cell sm:px-3 sm:py-2.5">{c ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="order-3 hidden text-muted-foreground sm:table-cell sm:px-3 sm:py-2.5">{t.business_id ? biz.get(t.business_id)?.name ?? "Business" : "Personal"}</td>
                  <td className={`order-1 text-right font-semibold tabular sm:px-3 sm:py-2.5 ${t.type === "income" ? "text-success" : ""}`}>{t.type === "income" ? "+" : "−"}{formatMoney(Number(t.amount), t.currency)}</td>
                  <td className="order-1 sm:px-2">
                    <Dropdown>
                      <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions"><Ellipsis /></Button></DropdownTrigger>
                      <DropdownContent>
                        <DropdownItem onSelect={() => setEdit(t)}><Pencil /> Edit</DropdownItem>
                        <DropdownItem onSelect={() => openFiles(t)}><Paperclip /> Receipts & files</DropdownItem>
                        <DropdownItem destructive onSelect={() => remove(t)}><Trash2 /> Delete</DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? <Link className="rounded-md border border-border px-3 py-1 hover:bg-muted" href={pageHref(page - 1)}>Previous</Link> : null}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Link className="rounded-md border border-border px-3 py-1 hover:bg-muted" href={pageHref(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
      {edit ? <TransactionDialog open tx={edit} onOpenChange={(o) => !o && setEdit(null)} /> : null}
      {files ? (
        <Dialog open onOpenChange={(o) => !o && setFiles(null)}>
          <DialogContent title="Receipts & documents" description={files.tx.description}>
            <Attachments entityType="transaction" entityId={files.tx.id} businessId={files.tx.business_id} initial={files.list} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
