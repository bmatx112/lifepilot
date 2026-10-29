import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const notice = sp.error === "link" ? "That link is invalid or has expired. Please try again." : sp.deleted ? "Your account has been deleted." : undefined;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Welcome back</h1>
      <p className="mb-4 text-sm text-muted-foreground">Sign in to your assistant.</p>
      <LoginForm next={next} notice={notice} />
    </>
  );
}
