import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";

const TABLES = [
  "businesses", "projects", "contacts", "categories", "transactions", "recurring_transactions", "budgets", "bills",
  "tasks", "task_checklist_items", "calendar_events", "email_accounts", "email_messages", "email_insights", "email_drafts",
  "attachments", "notifications", "scheduled_reminders", "daily_briefings", "ai_conversations", "ai_messages", "ai_action_logs", "audit_logs",
];

/** Full JSON export of the user's data (GDPR-style portability). OAuth tokens are never included. */
export async function GET() {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: allowed } = await u.supabase.rpc("check_rate_limit", { p_bucket: "account_export", p_limit: 5, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: "Export limit reached" }, { status: 429 });
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: u.user.id, email: u.user.email },
    profile: u.profile,
  };
  const { data: prefs } = await u.supabase.from("notification_preferences").select("*").eq("user_id", u.user.id).single();
  out.notification_preferences = prefs;
  for (const t of TABLES) {
    const { data } = await u.supabase.from(t).select("*").eq("user_id", u.user.id).limit(100_000);
    out[t] = data ?? [];
  }
  await u.supabase.rpc("log_audit", { p_action: "account_exported" });
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lifepilot-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
