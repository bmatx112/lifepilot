"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Route-based tabs that preserve selected query params (e.g. scope) across sections. */
export function PathTabs({ tabs, keep = [] }: { tabs: { href: string; label: string }[]; keep?: string[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = new URLSearchParams();
  keep.forEach((k) => sp.get(k) && qs.set(k, sp.get(k)!));
  const suffix = qs.toString() ? `?${qs}` : "";
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.href;
  return (
    <nav className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href + suffix} aria-current={t.href === active ? "page" : undefined}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.href === active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
