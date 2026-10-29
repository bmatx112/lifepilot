"use client";
import { useState } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, Clock, Mail, Plus, Smartphone, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/form";
import { EmptyState, SectionTitle } from "@/components/ui/misc";
import { ReminderDialog } from "@/components/tasks/reminder-dialog";
import { useLookups } from "@/components/layout/lookups";
import { clearReadNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/actions/settings";
import { cancelReminder } from "@/app/actions/tasks";
import { fmt } from "@/lib/dates";
import { describeRule } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { NotificationRow, ScheduledReminder } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  task_due: "Task", task_reminder: "Task", event: "Event", bill: "Bill", receivable: "Receivable", budget: "Budget",
  follow_up: "Follow-up", custom: "Reminder", daily_briefing: "Briefing", weekly_summary: "Summary",
};

export function NotificationsView({ notifications, upcoming }: { notifications: NotificationRow[]; upcoming: ScheduledReminder[] }) {
  const { timezone } = useLookups();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [adding, setAdding] = useState(false);
  const list = filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
            {(["all", "unread"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-3 py-1 capitalize", filter === f && "bg-muted font-medium")}>{f}{f === "unread" && unread ? ` (${unread})` : ""}</button>)}
          </div>
          <div className="flex gap-1">
            <ActionButton size="sm" variant="ghost" action={markAllNotificationsRead} disabled={!unread}><CheckCheck /> Mark all read</ActionButton>
            <ActionButton size="sm" variant="ghost" action={clearReadNotifications}><Trash2 /> Clear read</ActionButton>
          </div>
        </div>
        {list.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {list.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-3 py-2.5", !n.read_at && "bg-accent-soft/30")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="outline">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                    {n.url ? <Link href={n.url} onClick={() => !n.read_at && markNotificationRead(n.id)} className="text-sm font-medium hover:underline">{n.title}</Link> : <span className="text-sm font-medium">{n.title}</span>}
                  </div>
                  {n.body ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {fmt(n.created_at, timezone, "EEE d MMM, HH:mm")}
                    <span className="inline-flex items-center gap-1" title="Delivered via">
                      <Bell className="size-3" />{n.channels.includes("push") ? <Smartphone className="size-3" /> : null}{n.channels.includes("email") ? <Mail className="size-3" /> : null}
                    </span>
                  </p>
                </div>
                {!n.read_at ? <ActionButton size="icon-sm" variant="ghost" aria-label="Mark as read" action={() => markNotificationRead(n.id)}><X /></ActionButton> : null}
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Bell />} title={filter === "unread" ? "You're all caught up" : "No notifications yet"} description="Task, meeting, bill and budget alerts will appear here." />}
      </section>

      <aside>
        <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus /> Reminder</Button>}>Scheduled (next 48h+)</SectionTitle>
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5 text-sm shadow-card">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{fmt(r.fire_at, timezone, "EEE d MMM, HH:mm")}{r.recurrence_rule ? ` · ${describeRule(r.recurrence_rule)}` : ""}</p>
                </div>
                {r.kind === "custom" ? <ActionButton size="icon-sm" variant="ghost" aria-label="Cancel reminder" action={() => cancelReminder(r.id)}><X /></ActionButton> : null}
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<BellRing />} title="Nothing scheduled" description="Reminders for tasks, events and bills are planned automatically up to 48 hours ahead." />}
      </aside>
      {adding ? <ReminderDialog open onOpenChange={setAdding} /> : null}
    </div>
  );
}
