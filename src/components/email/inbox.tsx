"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleAlert, Clock, Inbox, Mail, Plus, Reply, Search, Sparkles, Star } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/misc";
import { ManualEmailDialog } from "@/components/email/manual-email-dialog";
import { useLookups } from "@/components/layout/lookups";
import { fmt, todayInTz } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { EmailAccount, EmailMessage } from "@/lib/types";

const FILTERS = [
  { k: "all", label: "All" },
  { k: "important", label: "Important" },
  { k: "unread", label: "Unread" },
  { k: "awaiting", label: "Awaiting reply" },
  { k: "followup", label: "Follow-ups" },
  { k: "analyzed", label: "Analysed" },
  { k: "manual", label: "Added manually" },
];

export function EmailInbox({ messages, accounts, filter, q, pendingSuggestions, aiEnabled, integrationsConfigured }: {
  messages: EmailMessage[]; accounts: EmailAccount[]; filter: string; q: string; pendingSuggestions: number; aiEnabled: boolean; integrationsConfigured: boolean;
}) {
  const { timezone } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState(q);
  const today = todayInTz(timezone);
  const go = (patch: Record<string, string>) => { const p = new URLSearchParams({ filter, ...(search ? { q: search } : {}), ...patch }); router.push(`${pathname}?${p}`); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm shadow-card">
        <Mail className="size-4 text-muted-foreground" />
        {accounts.length ? (
          accounts.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", a.status === "connected" ? "bg-success" : "bg-destructive")} />
              {a.email_address}
              <span className="text-xs text-muted-foreground">{a.status === "connected" ? (a.last_mail_sync_at ? `synced ${fmt(a.last_mail_sync_at, timezone, "HH:mm")}` : "not synced yet") : a.status}</span>
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">No mailbox connected{integrationsConfigured ? "" : " (integrations not configured on the server)"} — you can still paste emails manually.</span>
        )}
        <span className="flex-1" />
        <ButtonLink href="/settings/integrations" size="sm" variant="ghost">Manage</ButtonLink>
        <Button size="sm" variant="accent" onClick={() => setAdding(true)}><Plus /> Add email manually</Button>
      </div>
      {accounts.some((a) => a.status === "error") ? <Alert tone="danger" icon={<CircleAlert />} title="A mailbox needs attention">{accounts.filter((a) => a.last_error).map((a) => `${a.email_address}: ${a.last_error}`).join(" · ")}</Alert> : null}
      {!aiEnabled ? <Alert tone="info" icon={<Sparkles />}>AI summaries are off (OPENAI_API_KEY not set). “Analyse” uses conservative rule-based extraction instead.</Alert> : null}
      {pendingSuggestions ? <Alert tone="info" title={`${pendingSuggestions} suggested action(s) waiting for your review`}>Open an analysed email to accept or dismiss each suggestion.</Alert> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button key={f.k} onClick={() => go({ filter: f.k })} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", filter === f.k ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-muted-foreground hover:bg-muted")}>{f.label}</button>
          ))}
        </div>
        <form className="relative sm:ml-auto sm:w-64" onSubmit={(e) => { e.preventDefault(); go({}); }}>
          <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email" className="pl-8" aria-label="Search email" />
        </form>
      </div>

      {messages.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {messages.map((m) => (
            <li key={m.id}>
              <Link href={`/email/${m.id}`} className={cn("flex gap-3 px-3 py-2.5 hover:bg-muted/60", m.is_unread && "bg-accent-soft/20")}>
                <span className="pt-1">{m.is_important ? <Star className="size-4 fill-warning text-warning" /> : <span className="block size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm", m.is_unread && "font-semibold")}>{m.from_name ?? m.from_email ?? "Unknown sender"}</p>
                    <span className="shrink-0 text-xs tabular text-muted-foreground">{todayInTz(timezone, new Date(m.received_at)) === today ? fmt(m.received_at, timezone, "HH:mm") : fmt(m.received_at, timezone, "d MMM")}</span>
                  </div>
                  <p className={cn("truncate text-sm", m.is_unread ? "text-foreground" : "text-foreground/80")}>{m.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.ai_summary ?? m.snippet}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.awaiting_reply ? <Badge tone="info"><Reply className="size-3" /> awaiting reply</Badge> : null}
                    {m.follow_up_at ? <Badge tone="warning"><Clock className="size-3" /> follow up {fmt(m.follow_up_at, timezone, "d MMM")}</Badge> : null}
                    {m.ai_analyzed_at ? <Badge tone="accent"><Sparkles className="size-3" /> analysed</Badge> : null}
                    {m.source === "manual" ? <Badge>manual</Badge> : null}
                    {m.is_demo ? <Badge tone="warning">Demo</Badge> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Inbox />} title="No emails here" description={accounts.length ? "Nothing matches this filter. New mail syncs every ~15 minutes, or use Sync now in Integrations." : "Connect Gmail/Outlook or paste an email to analyse it."} />}
      {adding ? <ManualEmailDialog onOpenChange={setAdding} /> : null}
    </div>
  );
}
