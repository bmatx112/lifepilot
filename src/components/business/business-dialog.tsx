"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { CurrencySelect } from "@/components/ui/fields";
import { saveBusiness } from "@/app/actions/business";
import type { Business } from "@/lib/types";

export function BusinessDialog({ business, onOpenChange }: { business?: Business | null; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { formAction, fieldErrors, pending } = useFormAction(saveBusiness, {
    onSuccess: (r) => {
      onOpenChange(false);
      const id = r.ok ? (r.data as { id?: string })?.id : null;
      if (!business && id) router.push(`/business/${id}`);
    },
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={business ? "Edit business" : "New business or project"}>
        <form onSubmit={formAction} className="grid gap-3">
          {business ? <input type="hidden" name="id" value={business.id} /> : null}
          <Field label="Name" htmlFor="bz-name" error={fieldErrors.name}><Input id="bz-name" name="name" defaultValue={business?.name} required autoFocus /></Field>
          <div className="grid grid-cols-[1fr_6.5rem_4rem] gap-2">
            <Field label="Industry" htmlFor="bz-ind"><Input id="bz-ind" name="industry" defaultValue={business?.industry ?? ""} placeholder="e.g. Retail" /></Field>
            <Field label="Currency" htmlFor="bz-cur"><CurrencySelect id="bz-cur" defaultValue={business?.currency} /></Field>
            <Field label="Colour" htmlFor="bz-col"><Input id="bz-col" type="color" name="color" defaultValue={business?.color ?? "#0f766e"} className="h-10 p-1" /></Field>
          </div>
          <Field label="Description" htmlFor="bz-desc"><Textarea id="bz-desc" name="description" rows={2} defaultValue={business?.description ?? ""} /></Field>
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">{business ? "Save" : "Create business"}</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewBusinessButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="accent" onClick={() => setOpen(true)}><Plus /> New business</Button>
      {open ? <BusinessDialog onOpenChange={setOpen} /> : null}
    </>
  );
}
