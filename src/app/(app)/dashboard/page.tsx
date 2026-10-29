import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, Building2, CalendarDays, Clock, History, Inbox, MapPin, Receipt, Reply, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { getOverview } from "@/lib/data/overview";
import { rulesBriefing } from "@/lib/ai/briefing";
import { currenciesIn, outstandingCents } from "@/lib/finance";
import { formatCents } from "@/lib/money";
import { fmt, daysBetween } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, priorityTone } from "@/components/ui/badge";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Greeting } from "@/components/dashboard/clock";
import { BriefingCard } from "@/components/dashboard/briefing";
import { QuickActionButtons } from "@/components/layout/quick-actions";
import { TaskList } from "@/components/tasks/task-list";
import { cn } from "@/lib/utils";
import type { Bill } from "@/lib/types";

export const metadata = { title: "Dashboard" };

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">{children}<ArrowRight className="size-3" /></Link>;
}

function BillLine({ b, today }: { b: Bill; today: string }) {
  const d = daysBetween(today, b.due_date);
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate">{b.title} {b.is_demo ? <Badge tone="warning">Demo</Badge> : null}</p>
        <p className={cn("text-xs", d < 0 ? "text-destructive" : d <= 2 ? "text-warning" : "text-muted-foreground")}>
          {b.kind === "receivable" ? "Expected " : "Due "}{d < 0 ? `${-d} day(s) overdue` : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`} · {b.due_date}
        </p>
      </div>
      <span className={cn("shrink-0 font-medium tabular", b.kind === "receivable" && "text-success")}>{formatCents(outstandingCents(b), b.currency)}</span>
    </li>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  insert: "Added", update: "Updated", delete: "Deleted",
};
const ENTITY_LABEL: Record<string, string> = {
  transactions: "transaction", budgets: "budget", bills: "bill", businesses: "business", email_accounts: "email account", recurring_transactions: "recurring entry",
};

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const o = await getOverview(supabase, user.id, tz);
  const { data: stored } = await supabase.from("daily_briefings").select("content, generated_by").eq("kind", "daily").eq("briefing_date", o.today).maybeSingle();
  const briefing = stored ?? { content: rulesBriefing(o, tz, profile.full_name ?? "there"), generated_by: "rules" as const };
  const currencies = currenciesIn(o.month.summary);
  if (!currencies.length) currencies.push(profile.default_currency);

  // Business priorities: urgent/high open tasks and overdue counts per business
  const bizStats = o.businesses.map((b) => {
    const open = o.tasks.all.filter((t) => t.business_id === b.id);
    const next = open.filter((t) => t.due_at).sort((a, z) => a.due_at!.localeCompare(z.due_at!))[0];
    return {
      b,
      urgent: open.filter((t) => t.priority === "urgent" || t.priority === "high").length,
      overdue: open.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length,
      open: open.length,
      next,
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <Greeting name={profile.full_name ?? "there"} tz={tz} />
      </div>

      <QuickActionButtons />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><BriefingCard content={briefing.content} generatedBy={briefing.generated_by as "ai" | "rules"} aiEnabled={features.ai()} /></div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-accent" /> This month</CardTitle><CardLink href="/finance">Finance</CardLink></CardHeader>
          <CardContent>
            {/* One row per currency: amounts in different currencies are never added together. */}
            <table className="w-full whitespace-nowrap text-[13px] tabular">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1 font-medium">&nbsp;</th><th className="pb-1 text-right font-medium">Income</th><th className="pb-1 text-right font-medium">Expenses</th><th className="pb-1 text-right font-medium">Net</th></tr></thead>
              <tbody>
                {currencies.map((c) => {
                  const net = o.month.summary.net[c] ?? 0;
                  return (
                    <tr key={c} className="border-t border-border/60">
                      <td className="py-1.5 text-xs font-medium text-muted-foreground">{c}</td>
                      <td className="py-1.5 text-right font-semibold text-success">{formatCents(o.month.summary.income[c] ?? 0, c)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatCents(o.month.summary.expense[c] ?? 0, c)}</td>
                      <td className={cn("py-1.5 text-right font-semibold", net < 0 && "text-destructive")}>{formatCents(net, c, { signed: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4 text-accent" /> Today&apos;s schedule</CardTitle><CardLink href={`/calendar?view=day&date=${o.today}`}>Calendar</CardLink></CardHeader>
          <CardContent>
            {o.events.length ? (
              <ol className="space-y-2">
                {o.events.map((e) => (
                  <li key={e.key} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 text-xs font-medium tabular text-muted-foreground">{e.event.all_day ? "All day" : fmt(e.start, tz, "HH:mm")}</span>
                    <div className="min-w-0 border-l-2 border-accent pl-2">
                      <p className="truncate font-medium">{e.event.title} {e.event.is_demo ? <Badge tone="warning">Demo</Badge> : null}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {e.event.all_day ? "" : `until ${fmt(e.end, tz, "HH:mm")}`}
                        {e.event.location ? <><MapPin className="ml-1 size-3" />{e.event.location}</> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <EmptyState title="Nothing scheduled today" icon={<CalendarDays />} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle className="flex items-center gap-2"><Clock className="size-4 text-accent" /> Tasks due today</CardTitle><CardDescription>{o.tasks.dueToday.length} due · {o.tasks.openCount} open in total</CardDescription></div>
            <CardLink href="/tasks">Tasks</CardLink>
          </CardHeader>
          <CardContent><TaskList tasks={o.tasks.dueToday} empty={<EmptyState title="No tasks due today" />} /></CardContent>
        </Card>

        <Card className={cn(o.tasks.overdue.length && "border-destructive/40")}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className={cn("size-4", o.tasks.overdue.length ? "text-destructive" : "text-muted-foreground")} /> Overdue</CardTitle>{o.tasks.overdue.length ? <Badge tone="danger">{o.tasks.overdue.length}</Badge> : null}</CardHeader>
          <CardContent><TaskList tasks={o.tasks.overdue.slice(0, 8)} empty={<EmptyState title="Nothing overdue — nice work" />} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Budget utilisation</CardTitle><CardLink href="/finance/budgets">Budgets</CardLink></CardHeader>
          <CardContent className="space-y-3">
            {o.budgets.length ? o.budgets.slice(0, 5).map((s) => (
              <div key={s.budget.id}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{s.budget.name}</span><span className={cn("tabular", s.level === "exceeded" ? "text-destructive" : s.level === "warning" ? "text-warning" : "text-muted-foreground")}>{formatCents(s.spentCents, s.budget.currency)} / {formatCents(s.limitCents, s.budget.currency)}</span></div>
                <Progress value={s.percent} tone={s.level === "exceeded" ? "danger" : s.level === "warning" ? "warning" : "accent"} label={`${s.budget.name} ${Math.round(s.percent)}% used`} />
              </div>
            )) : <EmptyState title="No budgets yet" action={<Link className="text-xs text-accent underline" href="/finance/budgets">Create a budget</Link>} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="size-4 text-accent" /> Upcoming bills & payments</CardTitle><CardLink href="/finance/bills">Bills</CardLink></CardHeader>
          <CardContent>
            {o.bills.overdue.length + o.bills.dueSoon.length ? (
              <ul className="divide-y divide-border/60">
                {[...o.bills.overdue, ...o.bills.dueSoon].slice(0, 6).map((b) => <BillLine key={b.id} b={b} today={o.today} />)}
              </ul>
            ) : <EmptyState title="No payments due in the next 7 days" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Upcoming deadlines</CardTitle><span className="text-xs text-muted-foreground">next 7 days</span></CardHeader>
          <CardContent>
            {o.tasks.upcoming.length ? (
              <ul className="space-y-1.5">
                {o.tasks.upcoming.slice(0, 7).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{t.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5"><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge><span className="text-xs tabular text-muted-foreground">{fmt(t.due_at!, tz, "EEE d MMM")}</span></span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No deadlines in the next week" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Inbox className="size-4 text-accent" /> Important unread email</CardTitle><CardLink href="/email?filter=important">Email</CardLink></CardHeader>
          <CardContent>
            {o.emails.importantUnread.length ? (
              <ul className="space-y-2">
                {o.emails.importantUnread.slice(0, 5).map((e) => (
                  <li key={e.id}><Link href={`/email/${e.id}`} className="block rounded-md p-1 hover:bg-muted">
                    <p className="truncate text-sm font-medium">{e.subject} {e.is_demo ? <Badge tone="warning">Demo</Badge> : null}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.from_name ?? e.from_email} · {fmt(e.received_at, tz, "d MMM HH:mm")}</p>
                  </Link></li>
                ))}
              </ul>
            ) : <EmptyState title="No important unread email" description="Connect Gmail or Outlook in Settings → Integrations, or add emails manually." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Reply className="size-4 text-accent" /> Responses & follow-ups</CardTitle><CardLink href="/email?filter=awaiting">View</CardLink></CardHeader>
          <CardContent>
            {o.emails.awaitingReply.length + o.emails.followUps.length ? (
              <ul className="space-y-2">
                {o.emails.awaitingReply.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm"><Link href={`/email/${e.id}`} className="truncate hover:underline">{e.subject}</Link><Badge tone="info">reply</Badge></li>
                ))}
                {o.emails.followUps.slice(0, 4).map((e) => (
                  <li key={`f-${e.id}`} className="flex items-center justify-between gap-2 text-sm"><Link href={`/email/${e.id}`} className="truncate hover:underline">{e.subject}</Link><span className="shrink-0 text-xs text-muted-foreground">{fmt(e.follow_up_at!, tz, "d MMM HH:mm")}</span></li>
                ))}
              </ul>
            ) : <EmptyState title="No pending responses" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-accent" /> Business priorities</CardTitle><CardLink href="/business">Business</CardLink></CardHeader>
          <CardContent>
            {bizStats.length ? (
              <ul className="space-y-2.5">
                {bizStats.map(({ b, urgent, overdue, open, next }) => (
                  <li key={b.id}>
                    <Link href={`/business/${b.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: b.color }} /><span className="truncate">{b.name}</span>
                    </Link>
                    <span className="ml-4 mt-1 flex flex-wrap gap-1">{overdue ? <Badge tone="danger">{overdue} overdue</Badge> : null}{urgent ? <Badge tone="warning">{urgent} high priority</Badge> : null}<Badge>{open} open</Badge></span>
                    {next ? <p className="ml-4 truncate text-xs text-muted-foreground">Next: {next.title} · {fmt(next.due_at!, tz, "EEE d MMM")}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No businesses yet" action={<Link className="text-xs text-accent underline" href="/business">Add a business</Link>} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-4 text-accent" /> Notification centre</CardTitle><CardLink href="/notifications">All</CardLink></CardHeader>
          <CardContent>
            {o.notifications.length ? (
              <ul className="space-y-2">
                {o.notifications.map((n) => (
                  <li key={n.id} className="flex gap-2 text-sm">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
                    <div className="min-w-0">
                      {n.url ? <Link href={n.url} className="block truncate hover:underline">{n.title}</Link> : <p className="truncate">{n.title}</p>}
                      <p className="text-xs text-muted-foreground">{fmt(n.created_at, tz, "d MMM HH:mm")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No notifications yet" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4 text-accent" /> Recent activity</CardTitle><CardLink href="/settings/activity">Activity log</CardLink></CardHeader>
          <CardContent>
            {o.recentActivity.length ? (
              <ul className="space-y-1.5">
                {o.recentActivity.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{AUDIT_LABEL[a.action] ?? a.action.replace(/_/g, " ")} {ENTITY_LABEL[a.entity_type] ?? ""}{a.metadata?.title ? `: ${a.metadata.title}` : ""}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmt(a.created_at, tz, "d MMM HH:mm")}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No activity yet" description="Start by recording a transaction or creating a task." />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
