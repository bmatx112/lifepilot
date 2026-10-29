"use client";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { updatePassword } from "@/app/actions/auth";

export function PasswordForm() {
  const { formAction, pending } = useFormAction(updatePassword);
  return (
    <form onSubmit={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="New password" htmlFor="pw"><Input id="pw" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <Field label="Confirm" htmlFor="pw2"><Input id="pw2" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <div><SubmitButton pending={pending} variant="outline">Update password</SubmitButton></div>
    </form>
  );
}
