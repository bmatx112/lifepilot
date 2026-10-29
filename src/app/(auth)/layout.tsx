import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)] px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">LP</span>
        LifePilot <span className="text-accent">AI</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">Your data is private to your account and protected by row-level security.</p>
    </div>
  );
}
