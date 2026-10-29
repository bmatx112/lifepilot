import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!features.push()) return NextResponse.json({ error: "Push is not configured on the server (VAPID keys missing)." }, { status: 503 });
  const { data: allowed } = await u.supabase.rpc("check_rate_limit", { p_bucket: "push_test", p_limit: 5, p_window_seconds: 300 });
  if (allowed === false) return NextResponse.json({ error: "Too many test notifications" }, { status: 429 });
  const r = await sendPushToUser(u.supabase, u.user.id, { title: "LifePilot test notification", body: "Push notifications are working on this device.", url: "/notifications", tag: "test" });
  if (!r.sent) return NextResponse.json({ error: "No active push subscription for your account. Enable notifications on this device first." }, { status: 404 });
  return NextResponse.json({ ok: true, sent: r.sent });
}
