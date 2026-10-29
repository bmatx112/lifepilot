"use client";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { ScopeSelect } from "@/components/ui/fields";
import { addManualEmail } from "@/app/actions/email";

export function ManualEmailDialog({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { formAction, pending } = useFormAction(addManualEmail, {
    onSuccess: (r) => {
      onOpenChange(false);
      const id = (r.ok && (r.data as { id?: string })?.id) || null;
      if (id) router.push(`/email/${id}`);
    },
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="Add an email manually" description="Paste an email to summarise it and extract tasks, meetings, invoices and deadlines — no mailbox connection needed." wide>
        <form onSubmit={formAction} className="grid gap-3">
          <Field label="Subject" htmlFor="me-subj"><Input id="me-subj" name="subject" required /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Sender name" htmlFor="me-fn"><Input id="me-fn" name="from_name" /></Field>
            <Field label="Sender email" htmlFor="me-fe"><Input id="me-fe" name="from_email" type="email" /></Field>
            <Field label="Related to" htmlFor="me-scope"><ScopeSelect id="me-scope" /></Field>
          </div>
          <Field label="Email text" htmlFor="me-body"><Textarea id="me-body" name="body_text" rows={10} required maxLength={50000} placeholder="Paste the email body here" /></Field>
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">Add email</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
