import { ResetForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      <ResetForm />
    </>
  );
}
