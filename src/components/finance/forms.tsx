"use client";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { CategorySelect, ContactSelect, CurrencySelect, ScopeSelect } from "@/components/ui/fields";
import { saveBill, saveBudget, saveCategory, saveRecurring, saveTransaction } from "@/app/actions/finance";
import { useLookups } from "@/components/layout/lookups";
import { todayInTz } from "@/lib/dates";
import type { Bill, Budget, Category, RecurringTransaction, Transaction } from "@/lib/types";

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

export function TransactionDialog({ open, onOpenChange, tx, defaults }: DialogProps & { tx?: Transaction | null; defaults?: Partial<Transaction> }) {
  const { timezone } = useLookups();
  const init = { ...defaults, ...tx };
  const [type, setType] = useState<"income" | "expense">((init.type as "income" | "expense") ?? "expense");
  const [scope, setScope] = useState<string>(init.business_id ?? "personal");
  const { formAction, fieldErrors, pending } = useFormAction(saveTransaction, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tx ? "Edit transaction" : type === "income" ? "Record income" : "Record expense"}>
        <form onSubmit={formAction} className="grid gap-3">
          {tx ? <input type="hidden" name="id" value={tx.id} /> : null}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Type">
            {(["expense", "income"] as const).map((t) => (
              <label key={t} className="cursor-pointer">
                <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="peer sr-only" />
                <span className="block rounded-md py-1.5 text-center text-sm font-medium capitalize text-muted-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-card">{t}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Field label="Amount" htmlFor="tx-amount" error={fieldErrors.amount}>
              <Input id="tx-amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={init.amount?.toString()} required autoFocus />
            </Field>
            <Field label="Currency" htmlFor="tx-cur" error={fieldErrors.currency}>
              <CurrencySelect id="tx-cur" defaultValue={init.currency} />
            </Field>
          </div>
          <Field label="Description" htmlFor="tx-desc" error={fieldErrors.description}>
            <Input id="tx-desc" name="description" defaultValue={init.description ?? ""} placeholder={type === "income" ? "e.g. Client payment" : "e.g. Groceries at OK Mart"} required maxLength={300} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date" htmlFor="tx-date" error={fieldErrors.occurred_on}>
              <Input id="tx-date" type="date" name="occurred_on" defaultValue={init.occurred_on ?? todayInTz(timezone)} required />
            </Field>
            <Field label="Belongs to" htmlFor="tx-scope" error={fieldErrors.business_id}>
              <ScopeSelect id="tx-scope" defaultValue={scope} onChange={setScope} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category" htmlFor="tx-cat">
              <CategorySelect id="tx-cat" kind={type} scope={scope} defaultValue={init.category_id} />
            </Field>
            <Field label="Payment method" htmlFor="tx-pm">
              <Input id="tx-pm" name="payment_method" list="payment-methods" defaultValue={init.payment_method ?? ""} placeholder="Cash, EcoCash, card…" maxLength={60} />
              <datalist id="payment-methods">
                {["Cash", "EcoCash", "OneMoney", "InnBucks", "Bank transfer", "Debit card", "Credit card", "ZIPIT", "Swipe"].map((m) => <option key={m} value={m} />)}
              </datalist>
            </Field>
          </div>
          <Field label={type === "income" ? "Received from" : "Paid to"} htmlFor="tx-cp">
            <Input id="tx-cp" name="counterparty" defaultValue={init.counterparty ?? ""} maxLength={160} />
          </Field>
          <Field label="Notes" htmlFor="tx-notes">
            <Textarea id="tx-notes" name="notes" defaultValue={init.notes ?? ""} rows={2} maxLength={2000} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <SubmitButton pending={pending} variant="accent" pendingText="Saving…">{tx ? "Save changes" : "Save"}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetDialog({ open, onOpenChange, budget }: DialogProps & { budget?: Budget | null }) {
  const [scope, setScope] = useState<string>(budget?.business_id ?? "personal");
  const { formAction, fieldErrors, pending } = useFormAction(saveBudget, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={budget ? "Edit budget" : "New budget"} description="Spending is matched by scope, currency and (optionally) category.">
        <form onSubmit={formAction} className="grid gap-3">
          {budget ? <input type="hidden" name="id" value={budget.id} /> : null}
          <Field label="Name" htmlFor="b-name" error={fieldErrors.name}>
            <Input id="b-name" name="name" defaultValue={budget?.name} placeholder="e.g. Groceries" required />
          </Field>
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Field label="Limit" htmlFor="b-amt" error={fieldErrors.amount}>
              <Input id="b-amt" name="amount" inputMode="decimal" defaultValue={budget?.amount?.toString()} required />
            </Field>
            <Field label="Currency" htmlFor="b-cur">
              <CurrencySelect id="b-cur" defaultValue={budget?.currency} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Period" htmlFor="b-period">
              <Select id="b-period" name="period" defaultValue={budget?.period ?? "monthly"}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </Select>
            </Field>
            <Field label="Scope" htmlFor="b-scope">
              <ScopeSelect id="b-scope" defaultValue={scope} onChange={setScope} />
            </Field>
          </div>
          <Field label="Category" htmlFor="b-cat" hint="Leave empty to track all expenses in this scope.">
            <CategorySelect id="b-cat" kind="expense" scope={scope} defaultValue={budget?.category_id} includeEmpty />
          </Field>
          <Field label="Alert at (% used)" htmlFor="b-th" error={fieldErrors.alert_thresholds} hint="Comma-separated, e.g. 80,100">
            <Input id="b-th" name="alert_thresholds" defaultValue={(budget?.alert_thresholds ?? [80, 100]).join(",")} />
          </Field>
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent">Save budget</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BillDialog({ open, onOpenChange, bill, defaults, onSaved }: DialogProps & { bill?: Bill | null; defaults?: Partial<Bill> & { source?: string }; onSaved?: () => void }) {
  const { timezone } = useLookups();
  const init = { ...defaults, ...bill };
  const [kind, setKind] = useState<"payable" | "receivable">(init.kind ?? "payable");
  const [scope, setScope] = useState<string>(init.business_id ?? "personal");
  const { formAction, fieldErrors, pending } = useFormAction(saveBill, { onSuccess: () => { onOpenChange(false); onSaved?.(); } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={bill ? "Edit" : kind === "payable" ? "New bill to pay" : "New receivable (money owed to you)"}>
        <form onSubmit={formAction} className="grid gap-3">
          {bill ? <input type="hidden" name="id" value={bill.id} /> : null}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {([["payable", "Bill / payable"], ["receivable", "Receivable / invoice"]] as const).map(([k, l]) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="peer sr-only" />
                <span className="block rounded-md py-1.5 text-center text-sm font-medium text-muted-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-card">{l}</span>
              </label>
            ))}
          </div>
          <Field label="Title" htmlFor="bl-title" error={fieldErrors.title}>
            <Input id="bl-title" name="title" defaultValue={init.title} placeholder={kind === "payable" ? "e.g. ZESA electricity" : "e.g. Invoice #104 – Acme Ltd"} required />
          </Field>
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Field label="Amount" htmlFor="bl-amt" error={fieldErrors.amount}>
              <Input id="bl-amt" name="amount" inputMode="decimal" defaultValue={init.amount?.toString()} required />
            </Field>
            <Field label="Currency" htmlFor="bl-cur"><CurrencySelect id="bl-cur" defaultValue={init.currency} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Due date" htmlFor="bl-due" error={fieldErrors.due_date}>
              <Input id="bl-due" type="date" name="due_date" defaultValue={init.due_date ?? todayInTz(timezone)} required />
            </Field>
            <Field label="Invoice / ref no." htmlFor="bl-inv"><Input id="bl-inv" name="invoice_number" defaultValue={init.invoice_number ?? ""} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Belongs to" htmlFor="bl-scope"><ScopeSelect id="bl-scope" defaultValue={scope} onChange={setScope} /></Field>
            <Field label={kind === "payable" ? "Pay to (contact)" : "Customer (contact)"} htmlFor="bl-contact"><ContactSelect id="bl-contact" businessId={scope} defaultValue={init.contact_id} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Category" htmlFor="bl-cat" className="col-span-3 sm:col-span-1"><CategorySelect id="bl-cat" kind={kind === "payable" ? "expense" : "income"} scope={scope} defaultValue={init.category_id} /></Field>
            <Field label="Repeats" htmlFor="bl-rec">
              <Select id="bl-rec" name="recurrence" defaultValue={init.recurrence ?? "none"}>
                <option value="none">No</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
              </Select>
            </Field>
            <Field label="Remind (days before)" htmlFor="bl-rem" error={fieldErrors.reminder_days_before}>
              <Input id="bl-rem" type="number" min={0} max={60} name="reminder_days_before" defaultValue={init.reminder_days_before ?? 3} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="bl-notes"><Textarea id="bl-notes" name="notes" rows={2} defaultValue={init.notes ?? ""} /></Field>
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent">Save</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringDialog({ open, onOpenChange, item }: DialogProps & { item?: RecurringTransaction | null }) {
  const { timezone } = useLookups();
  const [type, setType] = useState<"income" | "expense">(item?.type ?? "expense");
  const [scope, setScope] = useState<string>(item?.business_id ?? "personal");
  const { formAction, fieldErrors, pending } = useFormAction(saveRecurring, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={item ? "Edit recurring entry" : "New recurring income/expense"} description="Transactions are recorded automatically on each due date.">
        <form onSubmit={formAction} className="grid gap-3">
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["expense", "income"] as const).map((t) => (
              <label key={t} className="cursor-pointer">
                <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="peer sr-only" />
                <span className="block rounded-md py-1.5 text-center text-sm font-medium capitalize text-muted-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-card">{t}</span>
              </label>
            ))}
          </div>
          <Field label="Description" htmlFor="r-desc" error={fieldErrors.description}><Input id="r-desc" name="description" defaultValue={item?.description} required /></Field>
          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Field label="Amount" htmlFor="r-amt" error={fieldErrors.amount}><Input id="r-amt" name="amount" inputMode="decimal" defaultValue={item?.amount?.toString()} required /></Field>
            <Field label="Currency" htmlFor="r-cur"><CurrencySelect id="r-cur" defaultValue={item?.currency} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Frequency" htmlFor="r-freq">
              <Select id="r-freq" name="frequency" defaultValue={item?.frequency ?? "monthly"}>
                <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
              </Select>
            </Field>
            <Field label="Next date" htmlFor="r-next" error={fieldErrors.next_run_on}><Input id="r-next" type="date" name="next_run_on" defaultValue={item?.next_run_on ?? todayInTz(timezone)} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Belongs to" htmlFor="r-scope"><ScopeSelect id="r-scope" defaultValue={scope} onChange={setScope} /></Field>
            <Field label="Category" htmlFor="r-cat"><CategorySelect id="r-cat" kind={type} scope={scope} defaultValue={item?.category_id} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Payment method" htmlFor="r-pm"><Input id="r-pm" name="payment_method" defaultValue={item?.payment_method ?? ""} /></Field>
            <Field label="End date (optional)" htmlFor="r-end"><Input id="r-end" type="date" name="end_on" defaultValue={item?.end_on ?? ""} /></Field>
          </div>
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent">Save</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({ open, onOpenChange, category }: DialogProps & { category?: Category | null }) {
  const { formAction, fieldErrors, pending } = useFormAction(saveCategory, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={category ? "Edit category" : "New category"}>
        <form onSubmit={formAction} className="grid gap-3">
          {category ? <input type="hidden" name="id" value={category.id} /> : null}
          <Field label="Name" htmlFor="c-name" error={fieldErrors.name}><Input id="c-name" name="name" defaultValue={category?.name} required maxLength={60} /></Field>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="Type" htmlFor="c-kind">
              <Select id="c-kind" name="kind" defaultValue={category?.kind ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></Select>
            </Field>
            <Field label="Colour" htmlFor="c-color"><Input id="c-color" type="color" name="color" defaultValue={category?.color ?? "#0f766e"} className="h-10 p-1" /></Field>
          </div>
          <Field label="Available for" htmlFor="c-scope" hint="Personal categories are available everywhere; business categories only within that business.">
            <ScopeSelect id="c-scope" defaultValue={category?.business_id ?? "personal"} />
          </Field>
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent">Save</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
