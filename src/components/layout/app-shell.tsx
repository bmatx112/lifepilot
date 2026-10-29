"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { Bell, Ellipsis, LogOut, Sparkles, X } from "lucide-react";
import { NAV, MOBILE_PRIMARY } from "@/components/layout/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { QuickAddMenu } from "@/components/layout/quick-actions";
import { AssistantChat } from "@/components/assistant/chat";
import { useLookups } from "@/components/layout/lookups";
import { cn, initials } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Logo({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">LP</span>
      <span>LifePilot <span className={onDark ? "text-teal-300" : "text-accent"}>AI</span></span>
    </Link>
  );
}

export function AppShell({ children, unread, demo }: { children: React.ReactNode; unread: number; demo: boolean }) {
  const pathname = usePathname();
  const { name, email, features } = useLookups();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const open = () => setAssistantOpen(true);
    window.addEventListener("open-assistant", open);
    return () => window.removeEventListener("open-assistant", open);
  }, []);
  // Close the mobile menu after navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-4 py-4 text-white"><Logo onDark /></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(pathname, n.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-active hover:text-white",
                isActive(pathname, n.href) && "bg-sidebar-active font-medium text-white",
              )}
            >
              <n.icon className={cn("size-4", isActive(pathname, n.href) && "text-teal-300")} />
              <span className="flex-1">{n.label}</span>
              {n.href === "/notifications" && unread > 0 ? (
                <span className="rounded-full bg-teal-500 px-1.5 text-[11px] font-semibold text-white tabular">{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{name}</p>
              <p className="truncate text-xs">{email}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button className="rounded-md p-1.5 hover:bg-sidebar-active hover:text-white" aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-5">
          <Logo className="md:hidden" />
          <div className="flex-1" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <button onClick={() => setAssistantOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted" aria-label="Open assistant">
            <Sparkles className="size-4 text-accent" /> <span className="hidden sm:inline">Assistant</span>
          </button>
          <Link href="/notifications" className="relative inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Bell className="size-4" />
            {unread > 0 ? <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" /> : null}
          </Link>
          <QuickAddMenu onAsk={() => setAssistantOpen(true)} />
        </header>

        {demo ? (
          <div className="no-print border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">
            <strong>Demo mode:</strong> sample records are shown and labelled “Demo”. They are not real connected data. <Link href="/settings/data" className="underline">Remove demo data</Link>
          </div>
        ) : null}

        <main id="main" className="print-full mx-auto w-full max-w-7xl flex-1 px-3 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur md:hidden" aria-label="Main">
        {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href) ? "page" : undefined}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", isActive(pathname, n.href) && "text-accent")}>
            <n.icon className="size-5" />
            {"short" in n ? n.short : n.label}
          </Link>
        ))}
        <button onClick={() => setMoreOpen(true)} className="relative flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Ellipsis className="size-5" /> More
          {unread > 0 ? <span className="absolute right-[30%] top-1.5 size-2 rounded-full bg-destructive" /> : null}
        </button>
      </nav>

      {/* Mobile "More" sheet */}
      <D.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <D.Content className="pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-card p-4">
            <D.Title className="mb-3 text-sm font-semibold">Menu</D.Title>
            <D.Description className="sr-only">All sections</D.Description>
            <div className="grid grid-cols-3 gap-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-xs", isActive(pathname, n.href) && "border-accent text-accent")}>
                  <n.icon className="size-5" />
                  {"short" in n ? n.short : n.label}
                  {n.href === "/notifications" && unread > 0 ? <span className="text-[10px] text-destructive">{unread} unread</span> : null}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <ThemeToggle />
              <form action="/auth/signout" method="post"><button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><LogOut className="size-4" /> Sign out</button></form>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>

      {/* Assistant slide-over (available everywhere) */}
      <D.Root open={assistantOpen} onOpenChange={setAssistantOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <D.Title className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent" /> Assistant</D.Title>
              <div className="flex items-center gap-1">
                <Link href="/assistant" onClick={() => setAssistantOpen(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Open full page</Link>
                <D.Close className="rounded-md p-1 hover:bg-muted" aria-label="Close"><X className="size-4" /></D.Close>
              </div>
            </div>
            <D.Description className="sr-only">Ask questions about your data</D.Description>
            <AssistantChat aiEnabled={features.ai} compact />
          </D.Content>
        </D.Portal>
      </D.Root>
    </div>
  );
}
