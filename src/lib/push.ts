import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, features } from "@/lib/env";

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(env.vapidSubject(), env.vapidPublicKey()!, env.vapidPrivateKey()!);
  configured = true;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string;
}

/** Sends a Web Push message to all of a user's subscriptions; prunes expired ones. */
export async function sendPushToUser(supabase: SupabaseClient, userId: string, payload: PushPayload) {
  if (!features.push()) return { sent: 0, skipped: "push_not_configured" as const };
  configure();
  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12, urgency: "normal" },
      );
      sent++;
      await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        await supabase.from("push_subscriptions").update({ failure_count: (s.failure_count ?? 0) + 1 }).eq("id", s.id);
        console.error("web push failed", status, (err as Error).message);
      }
    }
  }
  return { sent };
}
