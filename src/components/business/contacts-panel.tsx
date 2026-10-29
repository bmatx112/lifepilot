"use client";
import { useState } from "react";
import { Mail, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ActionButton, SubmitButton, useFormAction } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { deleteContact, saveContact } from "@/app/actions/business";
import type { Contact } from "@/lib/types";

function ContactDialog({ contact, businessId, onOpenChange }: { contact: Contact | null; businessId: string; onOpenChange: (o: boolean) => void }) {
  const { formAction, fieldErrors, pending } = useFormAction(saveContact, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={contact ? "Edit contact" : "New contact"}>
        <form onSubmit={formAction} className="grid gap-3">
          {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
          <input type="hidden" name="business_id" value={businessId} />
          <Field label="Name" htmlFor="ct-name" error={fieldErrors.name}><Input id="ct-name" name="name" defaultValue={contact?.name} required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email" htmlFor="ct-email" error={fieldErrors.email}><Input id="ct-email" name="email" type="email" defaultValue={contact?.email ?? ""} /></Field>
            <Field label="Phone" htmlFor="ct-phone"><Input id="ct-phone" name="phone" type="tel" defaultValue={contact?.phone ?? ""} /></Field>
            <Field label="Company" htmlFor="ct-co"><Input id="ct-co" name="company" defaultValue={contact?.company ?? ""} /></Field>
            <Field label="Role" htmlFor="ct-role"><Input id="ct-role" name="role" defaultValue={contact?.role ?? ""} placeholder="Customer, supplier, staff…" /></Field>
          </div>
          <Field label="Notes" htmlFor="ct-notes"><Textarea id="ct-notes" name="notes" rows={2} defaultValue={contact?.notes ?? ""} /></Field>
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">Save contact</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsPanel({ contacts, businessId }: { contacts: Contact[]; businessId: string }) {
  const [edit, setEdit] = useState<Contact | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setEdit("new")}><Plus /> New contact</Button></div>
      {contacts.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{[c.role, c.company].filter(Boolean).join(" · ")}</p></div>
              {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><Mail className="size-3" />{c.email}</a> : null}
              {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><Phone className="size-3" />{c.phone}</a> : null}
              <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(c)}><Pencil /></Button>
              <ActionButton size="icon-sm" variant="ghost" className="text-destructive" aria-label="Delete" action={() => deleteContact(c.id)} confirm={{ title: `Delete ${c.name}?` }} confirmLabel="Delete"><Trash2 /></ActionButton>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Users />} title="No contacts yet" description="Customers, suppliers and team members for this business." />}
      {edit ? <ContactDialog contact={edit === "new" ? null : edit} businessId={businessId} onOpenChange={(o) => !o && setEdit(null)} /> : null}
    </div>
  );
}
