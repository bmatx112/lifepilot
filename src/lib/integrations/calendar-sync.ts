import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, IntegrationError, markAccountError } from "@/lib/integrations/tokens";
import { ops } from "@/lib/integrations";
import { features } from "@/lib/env";
import type { CalendarEvent } from "@/lib/types";

const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

/**
 * Pushes a local event (create/update/cancel) to its provider. Runs with the
 * service role because tokens are server-only; the event row was already
 * authorised through RLS by the caller, and every query is scoped by user_id.
 */
export async function pushEventToProvider(userId: string, ev: CalendarEvent): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ev.provider === "local" || !ev.email_account_id) return { ok: true };
  if (!features.serviceRole()) return { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" };
  const admin = createAdminClient();
  try {
    const { token, provider, userId: owner } = await getAccessToken(ev.email_account_id);
    if (owner !== userId) throw new IntegrationError("Account does not belong to this user");
    const r = await ops.upsertEvent(provider, token, {
      title: ev.title, description: ev.description, location: ev.location, start: new Date(ev.starts_at), end: new Date(ev.ends_at),
      allDay: ev.all_day, timezone: ev.timezone, recurrenceRule: ev.recurrence_rule, cancelled: ev.status === "cancelled",
    }, ev.external_id);
    await admin.from("calendar_events").update({
      external_id: r.externalId, external_etag: r.etag, sync_state: "synced", sync_error: null, last_synced_at: new Date().toISOString(),
    }).eq("id", ev.id).eq("user_id", userId);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("calendar_events").update({ sync_state: "error", sync_error: msg.slice(0, 500) }).eq("id", ev.id).eq("user_id", userId);
    return { ok: false, error: msg };
  }
}

export async function deleteEventFromProvider(userId: string, ev: CalendarEvent): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ev.provider === "local" || !ev.email_account_id || !ev.external_id) return { ok: true };
  try {
    const { token, provider, userId: owner } = await getAccessToken(ev.email_account_id);
    if (owner !== userId) throw new IntegrationError("Account does not belong to this user");
    await ops.deleteEvent(provider, token, ev.external_id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Two-way sync for one connected account:
 *  1. push local changes that are pending/failed,
 *  2. pull provider events in a rolling window and upsert by external id
 *     (unique index prevents duplicates),
 *  3. remove local copies of provider events deleted remotely.
 * Local edits that haven't been pushed yet are never overwritten.
 */
export async function syncCalendarAccount(accountId: string) {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("email_accounts").select("*").eq("id", accountId).single();
  if (!acc || !acc.calendar_sync_enabled) return { pulled: 0, pushed: 0 };
  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", acc.user_id).single();
  const tz = profile?.timezone ?? "UTC";

  try {
    const { token, provider } = await getAccessToken(accountId);

    // 1. Push
    const { data: pending } = await admin.from("calendar_events").select("*")
      .eq("user_id", acc.user_id).eq("email_account_id", accountId).in("sync_state", ["pending_push", "error"]).limit(50);
    let pushed = 0;
    for (const ev of (pending ?? []) as CalendarEvent[]) {
      const r = await pushEventToProvider(acc.user_id, ev);
      if (r.ok) pushed++;
    }

    // 2. Pull
    const from = new Date(Date.now() - PAST_DAYS * 86400_000);
    const to = new Date(Date.now() + FUTURE_DAYS * 86400_000);
    const remote = await ops.listEvents(provider, token, from, to, tz);
    const { data: localRows } = await admin.from("calendar_events")
      .select("id, external_id, external_etag, sync_state, recurrence_rule, starts_at")
      .eq("user_id", acc.user_id).eq("email_account_id", accountId).not("external_id", "is", null);
    const local = new Map((localRows ?? []).map((r) => [r.external_id as string, r]));
    // Recurring series that were created here are expanded locally; skip their remote instances.
    const localSeries = new Set((localRows ?? []).filter((r) => r.recurrence_rule).map((r) => r.external_id as string));

    const seen = new Set<string>();
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    for (const e of remote) {
      if (e.seriesId && localSeries.has(e.seriesId)) { seen.add(e.seriesId); continue; }
      seen.add(e.externalId);
      const existing = local.get(e.externalId);
      if (existing && (existing.sync_state === "pending_push" || existing.external_etag === e.etag)) continue;
      (existing ? updates : inserts).push({
        user_id: acc.user_id, provider, email_account_id: accountId, external_id: e.externalId, external_etag: e.etag,
        title: e.title.slice(0, 300), description: e.description, location: e.location, starts_at: e.start.toISOString(),
        ends_at: e.end.toISOString(), all_day: e.allDay, timezone: tz, status: e.cancelled ? "cancelled" : "confirmed",
        kind: "meeting", sync_state: "synced", sync_error: null, last_synced_at: new Date().toISOString(), source: "sync",
        ...(existing ? {} : { reminder_offsets: [15] }),
      });
    }
    // Bulk rows must share the same columns, so new and existing events are written separately.
    for (const batch of [inserts, updates]) {
      for (let i = 0; i < batch.length; i += 100) {
        const { error } = await admin.from("calendar_events").upsert(batch.slice(i, i + 100), { onConflict: "user_id,provider,external_id" });
        if (error) throw new Error(error.message);
      }
    }
    const upserts = [...inserts, ...updates];

    // 3. Remote deletions (only for non-recurring, already-synced events inside the window)
    const gone = (localRows ?? []).filter((r) =>
      !r.recurrence_rule && r.sync_state === "synced" && !seen.has(r.external_id as string) &&
      new Date(r.starts_at) >= from && new Date(r.starts_at) <= to);
    if (gone.length) await admin.from("calendar_events").delete().in("id", gone.map((g) => g.id)).eq("user_id", acc.user_id);

    await admin.from("email_accounts").update({ last_calendar_sync_at: new Date().toISOString(), status: "connected", last_error: null }).eq("id", accountId);
    return { pulled: upserts.length, pushed, removed: gone.length };
  } catch (e) {
    const err = e as IntegrationError;
    await markAccountError(accountId, `Calendar sync failed: ${err.message}`);
    throw err;
  }
}
