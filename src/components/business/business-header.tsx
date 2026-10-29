"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarPlus, Ellipsis, ListTodo, Pencil, Plus, Receipt, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { BusinessDialog } from "@/components/business/business-dialog";
import { TransactionDialog, BillDialog } from "@/components/finance/forms";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { EventDialog } from "@/components/calendar/event-dialog";
import { archiveBusiness, deleteBusiness } from "@/app/actions/business";
import type { Business } from "@/lib/types";

export function BusinessActions({ business }: { business: Business }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const close = (o: boolean) => !o && setDlg(null);
  return (
    <div className="flex gap-2">
      <Dropdown>
        <DropdownTrigger asChild><Button size="sm" variant="accent"><Plus /> Add</Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setDlg("expense")}><Receipt /> Expense</DropdownItem>
          <DropdownItem onSelect={() => setDlg("income")}><TrendingUp /> Income</DropdownItem>
          <DropdownItem onSelect={() => setDlg("invoice")}><Receipt /> Invoice (receivable)</DropdownItem>
          <DropdownItem onSelect={() => setDlg("bill")}><Receipt /> Bill to pay</DropdownItem>
          <DropdownItem onSelect={() => setDlg("task")}><ListTodo /> Task</DropdownItem>
          <DropdownItem onSelect={() => setDlg("event")}><CalendarPlus /> Meeting</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dropdown>
        <DropdownTrigger asChild><Button size="icon-sm" variant="outline" aria-label="Business settings"><Ellipsis /></Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => setDlg("edit")}><Pencil /> Edit details</DropdownItem>
          <DropdownItem onSelect={async () => { const r = await archiveBusiness(business.id, !business.archived); if (r.ok) toast.success(r.message); else toast.error(r.error); }}>
            {business.archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => setDlg("delete")}><Trash2 /> Delete permanently</DropdownItem>
        </DropdownContent>
      </Dropdown>
      {dlg === "edit" ? <BusinessDialog business={business} onOpenChange={close} /> : null}
      {dlg === "expense" || dlg === "income" ? <TransactionDialog open onOpenChange={close} defaults={{ type: dlg, business_id: business.id, currency: business.currency }} /> : null}
      {dlg === "invoice" || dlg === "bill" ? <BillDialog open onOpenChange={close} defaults={{ kind: dlg === "invoice" ? "receivable" : "payable", business_id: business.id, currency: business.currency }} /> : null}
      {dlg === "task" ? <TaskDialog open onOpenChange={close} defaults={{ business_id: business.id }} /> : null}
      {dlg === "event" ? <EventDialog open onOpenChange={close} defaults={{ business_id: business.id, kind: "business" }} /> : null}
      {dlg === "delete" ? (
        <Dialog open onOpenChange={close}>
          <DialogContent title={`Delete ${business.name}?`} description="This permanently deletes the business and ALL of its transactions, budgets, bills, tasks, events, contacts and documents. Consider archiving instead.">
            <div className="space-y-3">
              <Field label={`Type “${business.name}” to confirm`} htmlFor="del-biz"><Input id="del-biz" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
                <Button variant="destructive" disabled={confirmName.trim() !== business.name.trim()} onClick={async () => {
                  const r = await deleteBusiness(business.id, confirmName);
                  if (r.ok) { toast.success(r.message); router.push("/business"); } else toast.error(r.error);
                }}>Delete everything</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
