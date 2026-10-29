export const metadata = { title: "Setup required" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">LifePilot setup</h1>
      {configured ? (
        <p className="mt-3 text-sm">Supabase is configured. <a className="text-accent underline" href="/login">Go to sign in</a>.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">The app can&apos;t start until Supabase is configured. Set these environment variables and restart:</p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-xs">{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role / secret key>
TOKEN_ENCRYPTION_KEY=<random 32+ char secret>
CRON_SECRET=<random secret>`}</pre>
          <p className="mt-4 text-sm text-muted-foreground">Then apply the SQL migrations in <code>supabase/migrations</code>. See README.md for full instructions.</p>
        </>
      )}
    </main>
  );
}
