import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToDateString, nextLocalTime, safeTz, todayInTz } from "@/lib/dates";
import { fromZonedTime } from "date-fns-tz";
import { expandEvents } from "@/lib/recurrence";
import type { Bill, CalendarEvent, NotificationPreferences, Task } from "@/lib/types";

/** How far ahead reminders are materialised. The cron tick must run more often than this. */
export const HORIZON_HOURS = 48;
const GRACE_MS = 5 * 60_000;

export interface PlannedReminder {
  user_id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  fire_at: string;
  dedupe_key: string;
}

function offsetLabel(min: number) {
  if (min === 0) return "now";
  if (min < 60) return `in ${min} min`;
  if (min < 1440) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} day(s)`;
}

/** Pure planning step: given records, produce the reminders due within the horizon. */
export function planReminders(input: {
  userId: string;
  tz: string;
  prefs: NotificationPreferences;
  tasks: Task[];
  events: CalendarEvent[];
  bills: Bill[];
  followUps: { id: string; subject: string; follow_up_at: string }[];
  now: Date;
}): PlannedReminder[] {
  const { userId, prefs, now } = input;
  const tz = safeTz(input.tz);
  const horizonEnd = new Date(now.getTime() + HORIZON_HOURS * 3600_000);
  const out: PlannedReminder[] = [];
  const inWindow = (d: Date) => d.getTime() >= now.getTime() - GRACE_MS && d <= horizonEnd;

  if (prefs.task_reminders_enabled) {
    for (const t of input.tasks) {
      if (!t.due_at || t.status === "completed" || t.status === "cancelled") continue;
      const due = new Date(t.due_at);
      const offsets = Array.from(new Set([0, ...(t.reminder_offsets ?? [])]));
      for (const off of offsets) {
        const fire = new Date(due.getTime() - off * 60_000);
        if (!inWindow(fire)) continue;
        out.push({
          user_id: userId,
          kind: off === 0 ? "task_due" : "task_reminder",
          entity_type: "task",
          entity_id: t.id,
          title: off === 0 ? `Task due: ${t.title}` : `Task due ${offsetLabel(off)}: ${t.title}`,
          body: t.priority === "urgent" || t.priority === "high" ? `${t.priority.toUpperCase()} priority` : null,
          url: `/tasks?task=${t.id}`,
          fire_at: fire.toISOString(),
          dedupe_key: `task:${t.id}:${due.toISOString()}:${off}`,
        });
      }
    }
  }

  if (prefs.event_reminders_enabled) {
    const maxOffset = Math.max(0, ...input.events.flatMap((e) => e.reminder_offsets ?? [])) * 60_000;
    const occ = expandEvents(
      input.events.filter((e) => e.status !== "cancelled"),
      now,
      new Date(horizonEnd.getTime() + maxOffset),
    );
    for (const o of occ) {
      for (const off of o.event.reminder_offsets ?? []) {
        const fire = new Date(o.start.getTime() - off * 60_000);
        if (!inWindow(fire)) continue;
        out.push({
          user_id: userId,
          kind: "event",
          entity_type: "event",
          entity_id: o.event.id,
          title: off === 0 ? `Starting now: ${o.event.title}` : `${o.event.title} starts ${offsetLabel(off)}`,
          body: o.event.location ? `Location: ${o.event.location}` : null,
          url: `/calendar?view=day&date=${todayInTz(tz, o.start)}`,
          fire_at: fire.toISOString(),
          dedupe_key: `event:${o.event.id}:${o.start.toISOString()}:${off}`,
        });
      }
    }
  }

  if (prefs.bill_reminders_enabled) {
    for (const b of input.bills) {
      if (b.status !== "open") continue;
      const days = Array.from(new Set([b.reminder_days_before, 0]));
      for (const d of days) {
        const fireDate = addDaysToDateString(b.due_date, -d);
        const fire = fromZonedTime(`${fireDate}T08:00:00`, tz);
        if (!inWindow(fire)) continue;
        const what = b.kind === "payable" ? "Bill due" : "Payment expected";
        out.push({
          user_id: userId,
          kind: b.kind === "payable" ? "bill" : "receivable",
          entity_type: "bill",
          entity_id: b.id,
          title: d === 0 ? `${what} today: ${b.title}` : `${what} in ${d} day(s): ${b.title}`,
          body: `${b.currency} ${Number(b.amount).toFixed(2)} · due ${b.due_date}`,
          url: `/finance/bills`,
          fire_at: fire.toISOString(),
          dedupe_key: `bill:${b.id}:${b.due_date}:${d}`,
        });
      }
    }
  }

  if (prefs.follow_up_reminders_enabled) {
    for (const f of input.followUps) {
      const fire = new Date(f.follow_up_at);
      if (!inWindow(fire)) continue;
      out.push({
        user_id: userId,
        kind: "follow_up",
        entity_type: "email",
        entity_id: f.id,
        title: `Follow up: ${f.subject}`,
        body: null,
        url: `/email/${f.id}`,
        fire_at: fire.toISOString(),
        dedupe_key: `followup:${f.id}:${fire.toISOString()}`,
      });
    }
  }

  if (prefs.daily_briefing_enabled) {
    const fire = nextLocalTime(prefs.daily_briefing_time, tz, new Date(now.getTime() - GRACE_MS));
    if (inWindow(fire)) {
      const date = todayInTz(tz, fire);
      out.push({
        user_id: userId, kind: "daily_briefing", entity_type: null, entity_id: null,
        title: "Your daily briefing is ready", body: null, url: "/dashboard",
        fire_at: fire.toISOString(), dedupe_key: `briefing:${date}`,
      });
    }
  }

  if (prefs.weekly_summary_enabled) {
    for (let i = 0; i < 3; i++) {
      const date = addDaysToDateString(todayInTz(tz, now), i);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (dow !== prefs.weekly_summary_day) continue;
      const fire = fromZonedTime(`${date}T${prefs.weekly_summary_time.slice(0, 5)}:00`, tz);
      if (!inWindow(fire)) continue;
      out.push({
        user_id: userId, kind: "weekly_summary", entity_type: null, entity_id: null,
        title: "Your weekly summary is ready", body: null, url: "/reports",
        fire_at: fire.toISOString(), dedupe_key: `weekly:${date}`,
      });
    }
  }
  return out;
}

/** Loads a user's records and inserts any missing reminders (idempotent via dedupe keys). */
export async function planForUser(supabase: SupabaseClient, userId: string, now = new Date()) {
  const horizonEnd = new Date(now.getTime() + (HORIZON_HOURS + 24 * 31) * 3600_000).toISOString();
  const [{ data: profile }, { data: prefs }, tasks, events, bills, followUps] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase.from("notification_preferences").select("*").eq("user_id", userId).single(),
    supabase.from("tasks").select("*").eq("user_id", userId).in("status", ["pending", "in_progress"])
      .not("due_at", "is", null).gte("due_at", new Date(now.getTime() - GRACE_MS).toISOString()).lte("due_at", horizonEnd),
    supabase.from("calendar_events").select("*").eq("user_id", userId).neq("status", "cancelled")
      .or(`recurrence_rule.not.is.null,and(starts_at.gte."${new Date(now.getTime() - 86400_000).toISOString()}",starts_at.lte."${horizonEnd}")`),
    supabase.from("bills").select("*").eq("user_id", userId).eq("status", "open")
      .lte("due_date", addDaysToDateString(todayInTz("UTC", now), 62)).gte("due_date", addDaysToDateString(todayInTz("UTC", now), -1)),
    supabase.from("email_messages").select("id, subject, follow_up_at").eq("user_id", userId)
      .not("follow_up_at", "is", null).gte("follow_up_at", new Date(now.getTime() - GRACE_MS).toISOString()).lte("follow_up_at", horizonEnd),
  ]);
  if (!prefs) return 0;
  const planned = planReminders({
    userId,
    tz: profile?.timezone ?? "UTC",
    prefs: prefs as NotificationPreferences,
    tasks: (tasks.data ?? []) as Task[],
    events: (events.data ?? []) as CalendarEvent[],
    bills: (bills.data ?? []) as Bill[],
    followUps: (followUps.data ?? []) as { id: string; subject: string; follow_up_at: string }[],
    now,
  });
  if (!planned.length) return 0;
  const { error } = await supabase
    .from("scheduled_reminders")
    .upsert(planned, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (error) throw new Error(`Reminder planning failed: ${error.message}`);
  return planned.length;
}

/**
 * Call after an entity changes: removes its not-yet-sent reminders and re-plans.
 * Sent reminders are kept so the same notification is never delivered twice.
 */
export async function replanEntity(supabase: SupabaseClient, userId: string, entityType: string, entityId: string) {
  await supabase.from("scheduled_reminders").delete()
    .eq("user_id", userId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "pending");
  try {
    await planForUser(supabase, userId);
  } catch (e) {
    console.error(e);
  }
}
