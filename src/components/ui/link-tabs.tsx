import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs: each tab is a link, so state survives reloads and works without JS. */
export function LinkTabs({ tabs, active, className }: { tabs: { href: string; label: string; key: string; count?: number }[]; active: string; className?: string }) {
  return (
    <nav className={cn("no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1", className)} aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.key === active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 ? <span className="rounded bg-muted px-1.5 text-[11px] tabular">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
