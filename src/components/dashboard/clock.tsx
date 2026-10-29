"use client";
import { useSyncExternalStore } from "react";
import { fmt } from "@/lib/dates";

const STEP = 30_000;
function subscribe(cb: () => void) {
  const t = setInterval(cb, STEP);
  return () => clearInterval(t);
}
// Snapshot changes only every 30s so React doesn't re-render needlessly.
const snapshot = () => Math.floor(Date.now() / STEP) * STEP;

export function Greeting({ name, tz }: { name: string; tz: string }) {
  const ts = useSyncExternalStore(subscribe, snapshot, () => null);
  const now = ts ? new Date(ts) : null;
  const hour = now ? Number(fmt(now, tz, "H")) : 12;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greet}, {name.split(" ")[0]}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground tabular">{now ? `${fmt(now, tz, "EEEE, d MMMM yyyy · HH:mm")} (${tz})` : " "}</p>
    </div>
  );
}
