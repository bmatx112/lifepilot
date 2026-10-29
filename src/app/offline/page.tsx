export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">LifePilot needs a connection to load your latest data. Reminders will still arrive as push notifications once you&apos;re back online.</p>
    </main>
  );
}
