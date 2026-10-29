"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, Ellipsis, HandCoins, Paperclip, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Attachments } from "@/components/ui/attachments";
import { BillDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import { deleteBill, markBillPaid, recordPartialPayment } from "@/app/actions/finance";
import { billDueState, outstandingCents } from "@/lib/finance";
import { addTo, formatCents, type CurrencyTotals } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { daysBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Attachment, Bill } from "@/lib/types";

function Section({ title, bills, today, onAction, totals }: { title: string; bills: Bill[]; today: string; onAction: (a: string, b: Bill) => void; totals: CurrencyTotals }) {
  const { businesses, contacts } = useLookups();
  return (
    <section>
      <div className="mb-2 flex items-end justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground tabular">{Object.entries(totals).map(([c, v]) => formatCents(v, c)).join(" + ") || "—"} outstanding</span>
      </div>
      {bills.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {bills.map((b) => {
            const state = billDueState(b, today);
            const d = daysBetween(today, b.due_date);
            const contact = contacts.find((c) => c.id === b.contact_id);
            return (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.title} {b.invoice_number ? <span className="text-xs text-muted-foreground">#{b.invoice_number}</span> : null}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn(state === "overdue" && "font-medium text-destructive", state === "due_soon" && "text-warning")}>
                      {b.status !== "open" ? `${b.status} ${b.paid_on ?? ""}` : d < 0 ? `${-d}d overdue` : d === 0 ? "due today" : `due in ${d}d`} · {b.due_date}
                    </span>
                    <span>· {b.business_id ? businesses.find((x) => x.id === b.business_id)?.name : "Personal"}</span>
                    {contact ? <span>· {contact.name}</span> : null}
                    {b.recurrence !== "none" ? <Badge tone="info">{b.recurrence}</Badge> : null}
                    {Number(b.amount_paid) > 0 && b.status === "open" ? <Badge tone="accent">part-paid</Badge> : null}
                    {b.source === "email" ? <Badge tone="info">from email</Badge> : null}
                    {b.is_demo ? <Badge tone="warning">Demo</Badge> : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular">{formatCents(b.status === "open" ? outstandingCents(b) : Math.round(Number(b.amount) * 100), b.currency)}</p>
                  <Badge tone={statusTone(state)}>{state.replace("_", " ")}</Badge>
                </div>
                <Dropdown>
                  <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions"><Ellipsis /></Button></DropdownTrigger>
                  <DropdownContent>
                    {b.status === "open" ? <>
                      <DropdownItem onSelect={() => onAction("pay", b)}><CircleCheck /> {b.kind === "payable" ? "Mark as paid" : "Mark as received"}</DropdownItem>
                      <DropdownItem onSelect={() => onAction("partial", b)}><HandCoins /> Record part payment</DropdownItem>
                      <DropdownItem onSelect={() => onAction("edit", b)}><Pencil /> Edit</DropdownItem>
                    </> : null}
                    <DropdownItem onSelect={() => onAction("files", b)}><Paperclip /> Documents</DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem destructive onSelect={() => onAction("delete", b)}><Trash2 /> Delete</DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState title={`No ${title.toLowerCase()}`} />}
    </section>
  );
}

export function BillsView({ bills, today, status }: { bills: Bill[]; today: string; status: "open" | "closed" }) {
  const [dialog, setDialog] = useState<{ kind: string; bill?: Bill; files?: Attachment[] } | null>(null);
  const [recordTx, setRecordTx] = useState(true);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const sp = useSearchParams();
  const payables = bills.filter((b) => b.kind === "payable");
  const receivables = bills.filter((b) => b.kind === "receivable");
  const totals = (list: Bill[]) => { const t: CurrencyTotals = {}; list.forEach((b) => addTo(t, b.currency, outstandingCents(b))); return t; };
  const link = (s: string) => { const q = new URLSearchParams(sp.toString()); q.set("status", s); return `${pathname}?${q}`; };

  const onAction = async (a: string, b: Bill) => {
    if (a === "delete") {
      if (!window.confirm(`Delete “${b.title}”?`)) return;
      const r = await deleteBill(b.id);
      if (r.ok) toast.success(r.message); else toast.error(r.error);
      return;
    }
    if (a === "files") {
      const { data } = await createClient().from("attachments").select("*").eq("entity_type", "bill").eq("entity_id", b.id);
      return setDialog({ kind: "files", bill: b, files: (data ?? []) as Attachment[] });
    }
    setDialog({ kind: a, bill: b });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
          <Link href={link("open")} className={cn("rounded-md px-3 py-1", status === "open" && "bg-muted font-medium")}>Open</Link>
          <Link href={link("closed")} className={cn("rounded-md px-3 py-1", status === "closed" && "bg-muted font-medium")}>Paid / closed</Link>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "new-receivable" })}><Plus /> Receivable</Button>
          <Button size="sm" variant="accent" onClick={() => setDialog({ kind: "new-payable" })}><Plus /> Bill</Button>
        </div>
      </div>
      {!bills.length && status === "open" ? (
        <EmptyState icon={<Receipt />} title="No open bills or receivables" description="Track bills you need to pay and invoices customers owe you. You'll get reminders before each due date." />
      ) : (
        <>
          <Section title="Bills to pay" bills={payables} today={today} onAction={onAction} totals={totals(payables)} />
          <Section title="Money owed to you" bills={receivables} today={today} onAction={onAction} totals={totals(receivables)} />
        </>
      )}

      {dialog?.kind === "new-payable" || dialog?.kind === "new-receivable" ? (
        <BillDialog open defaults={{ kind: dialog.kind === "new-payable" ? "payable" : "receivable" }} onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
      {dialog?.kind === "edit" && dialog.bill ? <BillDialog open bill={dialog.bill} onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === "pay" && dialog.bill ? (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent title={dialog.bill.kind === "payable" ? "Mark as paid" : "Mark as received"} description={`${dialog.bill.title} · ${formatCents(outstandingCents(dialog.bill), dialog.bill.currency)}`}>
            <div className="space-y-3">
              <Checkbox checked={recordTx} onChange={(e) => setRecordTx(e.target.checked)} label={`Also record this as ${dialog.bill.kind === "payable" ? "an expense" : "income"} today`} />
              {dialog.bill.recurrence !== "none" ? <p className="text-xs text-muted-foreground">The next {dialog.bill.recurrence} occurrence will be created automatically.</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button variant="accent" disabled={busy} onClick={async () => {
                  setBusy(true);
                  const r = await markBillPaid(dialog.bill!.id, recordTx);
                  setBusy(false);
                  if (r.ok) { toast.success(r.message); r.warnings?.forEach((w) => toast.warning(w)); setDialog(null); } else toast.error(r.error);
                }}>Confirm</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {dialog?.kind === "partial" && dialog.bill ? (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent title="Record part payment" description={`Outstanding: ${formatCents(outstandingCents(dialog.bill), dialog.bill.currency)}`}>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const amt = Number(new FormData(e.currentTarget).get("amount"));
              const r = await recordPartialPayment(dialog.bill!.id, amt);
              if (r.ok) { toast.success(r.message); setDialog(null); } else toast.error(r.error);
            }}>
              <Field label={`Amount (${dialog.bill.currency})`} htmlFor="pp-amt"><Input id="pp-amt" name="amount" inputMode="decimal" required autoFocus /></Field>
              <div className="flex justify-end"><Button type="submit" variant="accent">Save</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {dialog?.kind === "files" && dialog.bill ? (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent title="Documents" description={dialog.bill.title}>
            <Attachments entityType="bill" entityId={dialog.bill.id} businessId={dialog.bill.business_id} initial={dialog.files ?? []} />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
