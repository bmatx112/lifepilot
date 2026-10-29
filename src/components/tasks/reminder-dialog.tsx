"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { REPEAT_OPTIONS } from "@/components/ui/fields";
import { saveReminder } from "@/app/actions/tasks";
import { useLookups } from "@/components/layout/lookups";

export function ReminderDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: { title?: string; fire_local?: string } }) {
  const { timezone } = useLookups();
  const { formAction, fieldErrors, pending } = useFormAction(saveReminder, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Set a reminder" description="Delivered as an in-app, push and (if enabled) email notification — even when the app is closed.">
        <form onSubmit={formAction} className="grid gap-3">
          <Field label="Remind me to…" htmlFor="r-title" error={fieldErrors.title}><Input id="r-title" name="title" defaultValue={defaults?.title} required autoFocus /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="When" htmlFor="r-at" error={fieldErrors.fire_at} hint={timezone}><Input id="r-at" type="datetime-local" name="fire_at" defaultValue={defaults?.fire_local} required /></Field>
            <Field label="Repeat" htmlFor="r-rep"><Select id="r-rep" name="repeat" defaultValue="none">{REPEAT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select></Field>
          </div>
          <Field label="Details (optional)" htmlFor="r-body"><Textarea id="r-body" name="body" rows={2} /></Field>
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">Schedule reminder</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
