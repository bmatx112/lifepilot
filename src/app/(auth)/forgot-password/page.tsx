import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Reset your password</h1>
      <p className="mb-4 text-sm text-muted-foreground">We&apos;ll email you a secure link.</p>
      <ForgotForm />
    </>
  );
}
