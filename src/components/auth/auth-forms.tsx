"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/actions/auth";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const { formAction, pending } = useFormAction(signIn, { silent: true });
  return (
    <form onSubmit={formAction} className="grid gap-3">
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} /></Field>
      <div className="-mt-1 text-right"><Link href="/forgot-password" className="text-xs text-accent hover:underline">Forgot password?</Link></div>
      <SubmitButton pending={pending} className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">New here? <Link href="/signup" className="text-accent hover:underline">Create an account</Link></p>
    </form>
  );
}

export function SignupForm() {
  const tz = useSyncExternalStore(() => () => {}, () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", () => "UTC");
  const { formAction, state, pending } = useFormAction(signUp, { silent: true });
  if (state?.ok) return <Alert tone="success" title="Almost there">{state.message}</Alert>;
  return (
    <form onSubmit={formAction} className="grid gap-3">
      <input type="hidden" name="timezone" value={tz} />
      <Field label="Full name" htmlFor="full_name"><Input id="full_name" name="full_name" autoComplete="name" required autoFocus /></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters"><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
      <p className="text-xs text-muted-foreground">Time zone detected: {tz}. You can change it in Settings.</p>
      <SubmitButton pending={pending} className="w-full" pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { formAction, state, pending } = useFormAction(requestPasswordReset, { silent: true });
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form onSubmit={formAction} className="grid gap-3">
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required autoFocus /></Field>
      <SubmitButton pending={pending} className="w-full">Send reset link</SubmitButton>
      <p className="text-center text-sm"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm() {
  const { formAction, state, pending } = useFormAction(updatePassword);
  if (state?.ok) return <Alert tone="success" title="Password updated"><Link href="/dashboard" className="underline">Continue to your dashboard</Link></Alert>;
  return (
    <form onSubmit={formAction} className="grid gap-3">
      <Field label="New password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus /></Field>
      <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} /></Field>
      <SubmitButton pending={pending} className="w-full">Update password</SubmitButton>
    </form>
  );
}
