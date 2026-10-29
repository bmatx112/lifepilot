import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTask, saveReminder } from "@/app/actions/tasks";
import { saveEvent } from "@/app/actions/calendar";
import { saveTransaction } from "@/app/actions/finance";
import { localInputToUtc } from "@/lib/dates";
import { replanEntity } from "@/lib/reminders/planner";
import { writeArgSchemas } from "@/lib/ai/tools";
import type { ActionResult, AiActionLog } from "@/lib/types";

function form(entries: Record<string, string | undefined | null>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== null && v !== "") fd.set(k, v);
  return fd;
}

/**
 * Executes a previously proposed AI action after explicit user confirmation.
 * Arguments are re-validated, and execution goes through the same server
 * actions (and therefore the same validation and RLS) as manual input.
 */
export async function executeAiAction(supabase: SupabaseClient, userId: string, tz: string, log: AiActionLog): Promise<ActionResult<unknown>> {
  const schema = writeArgSchemas[log.tool_name];
  if (!schema) return { ok: false, error: "Unknown action" };
  const parsed = schema.safeParse(log.arguments);
  if (!parsed.success) return { ok: false, error: "The proposed action has invalid details." };
  const a = parsed.data as Record<string, string | number | undefined>;

  switch (log.tool_name) {
    case "create_task":
      return saveTask(null, form({
        title: String(a.title), description: a.description as string, due_at: a.due_local as string, priority: a.priority as string,
        business_id: a.business_id as string, source: a.source_email_id ? "email" : "ai", source_ref: (a.source_email_id as string) ?? log.id,
      }));
    case "create_event":
      return saveEvent(null, form({
        title: String(a.title), start: String(a.start_local), end: String(a.end_local), location: a.location as string,
        description: a.description as string, kind: (a.kind as string) ?? "meeting", business_id: a.business_id as string,
        "reminder_offsets[]": "15", source: "ai", source_ref: log.id,
      }));
    case "create_reminder":
      return saveReminder(null, form({ title: String(a.title), fire_at: String(a.at_local), body: a.body as string }));
    case "set_email_follow_up": {
      const at = localInputToUtc(String(a.at_local), tz).toISOString();
      const { error } = await supabase.from("email_messages").update({ follow_up_at: at }).eq("id", String(a.email_id)).eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
      await replanEntity(supabase, userId, "email", String(a.email_id));
      return { ok: true, message: "Follow-up reminder set" };
    }
    case "draft_email_reply": {
      const { data: msg } = await supabase.from("email_messages").select("id, account_id, subject, from_email").eq("id", String(a.email_id)).eq("user_id", userId).single();
      if (!msg) return { ok: false, error: "Email not found" };
      const { data, error } = await supabase.from("email_drafts").insert({
        user_id: userId, message_id: msg.id, account_id: msg.account_id, to_emails: msg.from_email ? [msg.from_email] : [],
        subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`, body: String(a.body),
      }).select("id").single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, message: "Draft saved — review it on the email page before sending", data: { id: data.id } };
    }
    case "record_transaction":
      return saveTransaction(null, form({
        type: String(a.type), amount: String(a.amount), currency: String(a.currency).toUpperCase(), occurred_on: String(a.date),
        description: String(a.description), business_id: a.business_id as string, notes: "Recorded via AI assistant after confirmation",
      }));
    default:
      return { ok: false, error: "Unsupported action" };
  }
}
