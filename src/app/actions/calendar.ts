"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addDaysToDateString, fmt, localInputToUtc, startOfLocalDay } from "@/lib/dates";
import { buildRule, expandEvents, findConflicts } from "@/lib/recurrence";
import { replanEntity } from "@/lib/reminders/planner";
import { deleteEventFromProvider, pushEventToProvider } from "@/lib/integrations/calendar-sync";
import { eventSchema, fieldErrors, formToObject } from "@/lib/validation";
import type { ActionResult, CalendarEvent } from "@/lib/types";

function done(message: string, warnings?: string[], data?: unknown): ActionResult<unknown> {
  revalidatePath("/", "layout");
  return { ok: true, message, warnings, data };
}

export async function saveEvent(_prev: unknown, fd: FormData): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const raw = formToObject(fd);
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;

  let start: Date, end: Date;
  try {
    if (d.all_day) {
      const s = d.start.slice(0, 10);
      const e = d.end.slice(0, 10);
      start = startOfLocalDay(s, tz);
      end = startOfLocalDay(addDaysToDateString(e < s ? s : e, 1), tz);
    } else {
      start = localInputToUtc(d.start.slice(0, 16), tz);
      end = localInputToUtc(d.end.slice(0, 16), tz);
    }
  } catch {
    return { ok: false, error: "Invalid start or end time" };
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: "Invalid start or end time" };
  if (end <= start) return { ok: false, error: "The event must end after it starts.", fieldErrors: { end: ["End must be after start"] } };

  // Conflict detection against existing (expanded) events
  if (!d.all_day && raw.force !== "on" && d.status !== "cancelled") {
    const { data: nearby } = await supabase.from("calendar_events").select("*").eq("user_id", user.id).neq("status", "cancelled")
      .or(`recurrence_rule.not.is.null,and(starts_at.lt."${end.toISOString()}",ends_at.gt."${start.toISOString()}")`);
    const occ = expandEvents((nearby ?? []) as CalendarEvent[], new Date(start.getTime() - 86400_000), new Date(end.getTime() + 86400_000));
    const conflicts = findConflicts({ start, end, id: id ?? undefined }, occ);
    if (conflicts.length) {
      const list = conflicts.slice(0, 3).map((c) => `${c.event.title} (${fmt(c.start, tz, "EEE d MMM HH:mm")}–${fmt(c.end, tz, "HH:mm")})`);
      return { ok: false, error: `Time conflict with: ${list.join("; ")}. Tick “Save anyway” to keep both.`, fieldErrors: { conflict: list } };
    }
  }

  let syncAccount: { id: string; provider: string } | null = null;
  if (d.sync_account_id) {
    const { data: acc } = await supabase.from("email_accounts").select("id, provider, calendar_sync_enabled, status").eq("id", d.sync_account_id).eq("user_id", user.id).single();
    if (!acc || acc.status !== "connected") return { ok: false, error: "The selected calendar account is not connected." };
    syncAccount = acc;
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    title: d.title,
    description: d.description,
    location: d.location,
    kind: d.kind,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: d.all_day,
    timezone: tz,
    business_id: d.business_id,
    project_id: d.project_id,
    recurrence_rule: buildRule(d.repeat, { until: d.repeat_until }),
    reminder_offsets: d.reminder_offsets,
    status: d.status,
  };
  if (!id) {
    row.source = typeof raw.source === "string" && ["email", "ai"].includes(raw.source) ? raw.source : "manual";
    if (raw.source_ref) row.source_ref = raw.source_ref;
  }
  if (syncAccount) {
    row.provider = syncAccount.provider;
    row.email_account_id = syncAccount.id;
    row.sync_state = "pending_push";
  } else if (id) {
    // Edits to an already-synced event are pushed back to its provider.
    const { data: existing } = await supabase.from("calendar_events").select("provider").eq("id", id).single();
    if (existing && existing.provider !== "local") row.sync_state = "pending_push";
  }

  const res = id
    ? await supabase.from("calendar_events").update(row).eq("id", id).eq("user_id", user.id).select("*").single()
    : await supabase.from("calendar_events").insert(row).select("*").single();
  if (res.error) return { ok: false, error: res.error.message };
  await replanEntity(supabase, user.id, "event", res.data.id);

  const warnings: string[] = [];
  if (res.data.sync_state === "pending_push") {
    const r = await pushEventToProvider(user.id, res.data as CalendarEvent);
    if (!r.ok) warnings.push(`Saved locally, but syncing to your calendar failed: ${r.error}. It will be retried automatically.`);
  }
  return done(id ? "Event updated" : "Event created", warnings, { id: res.data.id });
}

export async function cancelEvent(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { data: ev, error } = await supabase.from("calendar_events").update({ status: "cancelled" }).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) return { ok: false, error: error.message };
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("entity_id", id).eq("status", "pending");
  const warnings: string[] = [];
  if (ev.provider !== "local") {
    await supabase.from("calendar_events").update({ sync_state: "pending_push" }).eq("id", id);
    const r = await pushEventToProvider(user.id, { ...(ev as CalendarEvent), status: "cancelled" });
    if (!r.ok) warnings.push(`Cancelled locally; provider update failed: ${r.error}`);
  }
  return done("Event cancelled", warnings);
}

/** Skips a single occurrence of a recurring event. */
export async function skipOccurrence(id: string, occurrenceIso: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  if (!z.iso.datetime().safeParse(occurrenceIso).success) return { ok: false, error: "Invalid occurrence" };
  const { data: ev } = await supabase.from("calendar_events").select("recurrence_exdates").eq("id", id).eq("user_id", user.id).single();
  if (!ev) return { ok: false, error: "Not found" };
  const exdates = Array.from(new Set([...(ev.recurrence_exdates ?? []), occurrenceIso]));
  const { error } = await supabase.from("calendar_events").update({ recurrence_exdates: exdates }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await replanEntity(supabase, user.id, "event", id);
  return done("This occurrence was removed");
}

export async function deleteEvent(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { data: ev } = await supabase.from("calendar_events").select("*").eq("id", id).eq("user_id", user.id).single<CalendarEvent>();
  if (!ev) return { ok: false, error: "Not found" };
  const warnings: string[] = [];
  if (ev.provider !== "local" && ev.external_id) {
    const r = await deleteEventFromProvider(user.id, ev);
    if (!r.ok) return { ok: false, error: `Could not delete from ${ev.provider === "google" ? "Google Calendar" : "Outlook"}: ${r.error}` };
  }
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("entity_id", id).eq("status", "pending");
  return done("Event deleted", warnings);
}
