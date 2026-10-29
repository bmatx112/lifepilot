import { SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Create your account</h1>
      <p className="mb-4 text-sm text-muted-foreground">Finances, tasks, calendar and email in one place.</p>
      <SignupForm />
    </>
  );
}
