import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { sendReminderEmail } from "@/lib/mailer";
import { inQuietHours, localTime } from "@/lib/dates";
import type { NotificationPreferences } from "@/lib/types";

export interface NotifyInput {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  reminderId?: string | null;
  dedupeKey?: string | null;
  /** Email is only sent for kinds the user would expect by email. */
  allowEmail?: boolean;
}

/**
 * Records an in-app notification and fans out to push/email according to the
 * user's preferences. The (user_id, dedupe_key) unique index makes this safe to
 * call repeatedly: a duplicate is skipped entirely.
 */
export async function notify(supabase: SupabaseClient, input: NotifyInput, opts?: { prefs?: NotificationPreferences; tz?: string }) {
  const prefs =
    opts?.prefs ??
    ((await supabase.from("notification_preferences").select("*").eq("user_id", input.userId).single()).data as NotificationPreferences | null);
  const channels: string[] = ["in_app"];
  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      reminder_id: input.reminderId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      channels,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { duplicate: true as const };
    throw new Error(error.message);
  }

  let quiet = false;
  if (prefs?.quiet_hours_enabled) {
    const tz = opts?.tz ?? (await supabase.from("profiles").select("timezone").eq("id", input.userId).single()).data?.timezone ?? "UTC";
    quiet = inQuietHours(localTime(new Date(), tz), prefs.quiet_hours_start, prefs.quiet_hours_end);
  }

  if (prefs?.push_enabled && !quiet) {
    try {
      const r = await sendPushToUser(supabase, input.userId, { title: input.title, body: input.body, url: input.url, tag: input.dedupeKey ?? undefined });
      if (r.sent > 0) channels.push("push");
    } catch (e) {
      console.error("push error", e);
    }
  }
  if (prefs?.email_enabled && prefs.email_address && input.allowEmail !== false && !quiet) {
    try {
      const r = await sendReminderEmail(prefs.email_address, input.title, input.body ?? input.title, input.url);
      if (r.sent) channels.push("email");
    } catch (e) {
      console.error("email error", e);
    }
  }
  if (channels.length > 1) await supabase.from("notifications").update({ channels }).eq("id", inserted.id);
  return { id: inserted.id as string, channels, quiet };
}
