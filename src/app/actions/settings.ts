"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeTz } from "@/lib/dates";
import { bool, fieldErrors, formToObject, intList, profileSchema } from "@/lib/validation";
import { planForUser } from "@/lib/reminders/planner";
import type { ActionResult } from "@/lib/types";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");

const prefsSchema = z.object({
  in_app_enabled: bool, push_enabled: bool, email_enabled: bool,
  email_address: z.preprocess((v) => (v === "" ? null : v), z.email("Enter a valid email").nullable()),
  quiet_hours_enabled: bool, quiet_hours_start: time, quiet_hours_end: time,
  daily_briefing_enabled: bool, daily_briefing_time: time,
  weekly_summary_enabled: bool, weekly_summary_day: z.coerce.number().int().min(0).max(6), weekly_summary_time: time,
  task_reminders_enabled: bool, event_reminders_enabled: bool, bill_reminders_enabled: bool,
  budget_alerts_enabled: bool, follow_up_reminders_enabled: bool,
  default_task_reminder_minutes: intList, default_event_reminder_minutes: intList,
});

export async function saveProfile(_p: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = profileSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (safeTz(parsed.data.timezone) !== parsed.data.timezone) return { ok: false, error: "Unknown time zone", fieldErrors: { timezone: ["Unknown time zone"] } };
  const { error } = await supabase.from("profiles").update({ ...parsed.data, onboarded: true }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  // Times of day (bills, briefings) depend on the time zone; re-plan pending reminders.
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("status", "pending").in("kind", ["bill", "receivable", "daily_briefing", "weekly_summary"]);
  await planForUser(supabase, user.id).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved" };
}

export async function saveNotificationPrefs(_p: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = formToObject(fd);
  const parsed = prefsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { error } = await supabase.from("notification_preferences").update(parsed.data).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  // Briefing/summary times may have changed: drop pending ones and re-plan.
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("status", "pending").in("kind", ["daily_briefing", "weekly_summary"]);
  await planForUser(supabase, user.id).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true, message: "Notification preferences saved" };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "All marked as read" };
}

export async function clearReadNotifications(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("notifications").delete().eq("user_id", user.id).not("read_at", "is", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Read notifications cleared" };
}
