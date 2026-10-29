import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inQuietHours, localTime, nextLocalTime, todayInTz } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurrence";
import { notify } from "@/lib/notify";
import { planForUser } from "@/lib/reminders/planner";
import { materializeRecurring } from "@/lib/recurring";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { generateBriefing, generateWeeklySummary } from "@/lib/ai/briefing";
import { syncMailAccount } from "@/lib/integrations/mail-sync";
import { syncCalendarAccount } from "@/lib/integrations/calendar-sync";
import type { NotificationPreferences, ScheduledReminder } from "@/lib/types";

type UserCtx = { prefs: NotificationPreferences; tz: string; name: string; currency: string };

const KIND_PREF: Record<string, keyof NotificationPreferences> = {
  task_due: "task_reminders_enabled",
  task_reminder: "task_reminders_enabled",
  event: "event_reminders_enabled",
  bill: "bill_reminders_enabled",
  receivable: "bill_reminders_enabled",
  follow_up: "follow_up_reminders_enabled",
  daily_briefing: "daily_briefing_enabled",
  weekly_summary: "weekly_summary_enabled",
};

async function loadUser(admin: SupabaseClient, userId: string, cache: Map<string, UserCtx | null>) {
  if (cache.has(userId)) return cache.get(userId)!;
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    admin.from("notification_preferences").select("*").eq("user_id", userId).single(),
    admin.from("profiles").select("timezone, full_name, default_currency").eq("id", userId).single(),
  ]);
  const ctx = prefs && profile ? { prefs: prefs as NotificationPreferences, tz: profile.timezone, name: profile.full_name ?? "there", currency: profile.default_currency } : null;
  cache.set(userId, ctx);
  return ctx;
}

/** Returns false when the underlying record no longer warrants this reminder. */
async function stillRelevant(admin: SupabaseClient, r: ScheduledReminder): Promise<boolean> {
  if (!r.entity_id) return true;
  if (r.entity_type === "task") {
    const { data } = await admin.from("tasks").select("status").eq("id", r.entity_id).eq("user_id", r.user_id).maybeSingle();
    return !!data && (data.status === "pending" || data.status === "in_progress");
  }
  if (r.entity_type === "event") {
    const { data } = await admin.from("calendar_events").select("status").eq("id", r.entity_id).eq("user_id", r.user_id).maybeSingle();
    return !!data && data.status !== "cancelled";
  }
  if (r.entity_type === "bill") {
    const { data } = await admin.from("bills").select("status").eq("id", r.entity_id).eq("user_id", r.user_id).maybeSingle();
    return !!data && data.status === "open";
  }
  if (r.entity_type === "email") {
    const { data } = await admin.from("email_messages").select("follow_up_at").eq("id", r.entity_id).eq("user_id", r.user_id).maybeSingle();
    return !!data?.follow_up_at;
  }
  return true;
}

export async function dispatchDue(admin: SupabaseClient, limit = 200) {
  const { data, error } = await admin.rpc("claim_due_reminders", { p_limit: limit });
  if (error) throw new Error(`claim_due_reminders: ${error.message}`);
  const cache = new Map<string, UserCtx | null>();
  const stats = { sent: 0, cancelled: 0, deferred: 0, failed: 0 };

  for (const r of (data ?? []) as ScheduledReminder[]) {
    try {
      const u = await loadUser(admin, r.user_id, cache);
      if (!u) { await admin.from("scheduled_reminders").update({ status: "cancelled" }).eq("id", r.id); stats.cancelled++; continue; }
      const prefKey = KIND_PREF[r.kind];
      if ((prefKey && u.prefs[prefKey] === false) || !(await stillRelevant(admin, r))) {
        await admin.from("scheduled_reminders").update({ status: "cancelled" }).eq("id", r.id);
        stats.cancelled++;
        continue;
      }
      // Quiet hours: defer delivery until the window ends (in the user's time zone).
      if (u.prefs.quiet_hours_enabled && inQuietHours(localTime(new Date(), u.tz), u.prefs.quiet_hours_start, u.prefs.quiet_hours_end)) {
        const resume = nextLocalTime(u.prefs.quiet_hours_end, u.tz, new Date());
        await admin.from("scheduled_reminders").update({ status: "pending", fire_at: resume.toISOString(), attempts: 0 }).eq("id", r.id);
        stats.deferred++;
        continue;
      }

      let body = r.body;
      if (r.kind === "daily_briefing") {
        const b = await generateBriefing(admin, r.user_id, u.tz, u.name);
        body = b.content.split("\n").slice(1, 4).join(" ").slice(0, 240) || b.content.slice(0, 240);
      } else if (r.kind === "weekly_summary") {
        const s = await generateWeeklySummary(admin, r.user_id, u.tz, u.currency);
        body = s.split("\n").slice(1, 3).join(" ").slice(0, 240);
      }

      await notify(admin, {
        userId: r.user_id, kind: r.kind, title: r.title, body, url: r.url, entityType: r.entity_type, entityId: r.entity_id,
        reminderId: r.id, dedupeKey: `reminder:${r.dedupe_key}`,
      }, { prefs: u.prefs, tz: u.tz });
      await admin.from("scheduled_reminders").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", r.id);
      stats.sent++;

      if (r.kind === "custom" && r.recurrence_rule) {
        const next = nextOccurrence(r.recurrence_rule, new Date(r.fire_at), new Date(r.fire_at));
        if (next) {
          await admin.from("scheduled_reminders").insert({
            user_id: r.user_id, kind: "custom", title: r.title, body: r.body, url: r.url, fire_at: next.toISOString(),
            recurrence_rule: r.recurrence_rule, dedupe_key: `${r.dedupe_key.split("@")[0]}@${next.toISOString()}`,
          });
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("scheduled_reminders").update({
        status: r.attempts >= 5 ? "failed" : "pending",
        fire_at: new Date(Date.now() + Math.min(60, 2 ** r.attempts) * 60_000).toISOString(),
        last_error: msg.slice(0, 500),
      }).eq("id", r.id);
      stats.failed++;
    }
  }
  return stats;
}

export async function planAllUsers(admin: SupabaseClient) {
  let planned = 0;
  let from = 0;
  const page = 500;
  for (;;) {
    const { data } = await admin.from("profiles").select("id").order("id").range(from, from + page - 1);
    if (!data?.length) break;
    for (const p of data) {
      try {
        planned += await planForUser(admin, p.id);
      } catch (e) {
        console.error("plan failed", p.id, e);
      }
    }
    if (data.length < page) break;
    from += page;
  }
  return planned;
}

export async function syncDueAccounts(admin: SupabaseClient, maxAccounts = 10) {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await admin.from("email_accounts").select("id, mail_sync_enabled, calendar_sync_enabled, last_mail_sync_at")
    .neq("status", "revoked").or(`last_mail_sync_at.is.null,last_mail_sync_at.lt."${cutoff}"`).order("last_mail_sync_at", { ascending: true, nullsFirst: true }).limit(maxAccounts);
  let ok = 0, failed = 0;
  for (const a of data ?? []) {
    const results = await Promise.allSettled([syncMailAccount(a.id), syncCalendarAccount(a.id)]);
    if (results.some((r) => r.status === "rejected")) failed++; else ok++;
    // Record an attempt even if mail sync is disabled so the queue keeps moving.
    if (!a.mail_sync_enabled) await admin.from("email_accounts").update({ last_mail_sync_at: new Date().toISOString() }).eq("id", a.id);
  }
  return { ok, failed };
}

/** One scheduler tick. Safe to run concurrently: every step is idempotent. */
export async function runTick(admin: SupabaseClient, opts: { sync?: boolean } = {}) {
  const started = Date.now();
  const today = todayInTz("UTC");
  const recurring = await materializeRecurring(admin, today);
  if (recurring) {
    const { data: users } = await admin.from("transactions").select("user_id").eq("source", "recurring").eq("occurred_on", today);
    for (const uid of new Set((users ?? []).map((u) => u.user_id as string))) {
      const { data: p } = await admin.from("profiles").select("timezone").eq("id", uid).single();
      await checkBudgetAlerts(admin, uid, p?.timezone ?? "UTC").catch((e) => console.error(e));
    }
  }
  const planned = await planAllUsers(admin);
  const dispatched = await dispatchDue(admin);
  const sync = opts.sync === false ? null : await syncDueAccounts(admin);
  // Housekeeping
  await admin.from("scheduled_reminders").delete().in("status", ["sent", "cancelled"]).lt("fire_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  return { recurring, planned, dispatched, sync, ms: Date.now() - started };
}
