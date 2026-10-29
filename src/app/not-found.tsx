import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">This page or record doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="text-sm text-accent underline">Back to dashboard</Link>
    </main>
  );
}
