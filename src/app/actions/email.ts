"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { analyzeEmail } from "@/lib/ai/email-analysis";
import { fetchMessageBody } from "@/lib/integrations/mail-sync";
import { getAccessToken } from "@/lib/integrations/tokens";
import { ops } from "@/lib/integrations";
import { localInputToUtc, todayInTz } from "@/lib/dates";
import { replanEntity } from "@/lib/reminders/planner";
import { formToObject, optUuid, reqText } from "@/lib/validation";
import type { ActionResult, EmailInsight, EmailMessage } from "@/lib/types";

function done(message: string, data?: unknown): ActionResult<unknown> {
  revalidatePath("/", "layout");
  return { ok: true, message, data };
}

const manualSchema = z.object({
  subject: reqText(500, "Subject"),
  from_email: z.preprocess((v) => (v === "" ? undefined : v), z.email("Enter a valid sender email").optional()),
  from_name: z.string().trim().max(160).optional(),
  body_text: reqText(50_000, "Email text"),
  business_id: optUuid,
});

/** Manual workflow: paste an email so it can be analysed without any integration. */
export async function addManualEmail(_p: unknown, fd: FormData): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const parsed = manualSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const { data, error } = await supabase.from("email_messages").insert({
    user_id: user.id, subject: d.subject, from_email: d.from_email?.toLowerCase() ?? null, from_name: d.from_name || null,
    body_text: d.body_text, snippet: d.body_text.replace(/\s+/g, " ").slice(0, 280), business_id: d.business_id,
    source: "manual", is_unread: false, received_at: new Date().toISOString(),
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  return done("Email added", { id: data.id });
}

export async function analyzeEmailAction(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_bucket: "email_analysis", p_limit: 30, p_window_seconds: 3600 });
  if (allowed === false) return { ok: false, error: "Analysis limit reached (30/hour). Please try later." };
  const { data: msg } = await supabase.from("email_messages").select("*").eq("id", id).eq("user_id", user.id).single<EmailMessage>();
  if (!msg) return { ok: false, error: "Email not found" };
  let body: string;
  try {
    body = await fetchMessageBody(user.id, msg);
  } catch (e) {
    return { ok: false, error: `Could not fetch the message: ${(e as Error).message}` };
  }
  let analysis;
  try {
    analysis = await analyzeEmail({
      subject: msg.subject, from: msg.from_email, receivedAt: msg.received_at, body, today: todayInTz(profile.timezone), tz: profile.timezone,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  // Replace previous un-reviewed suggestions; keep accepted/dismissed history.
  await supabase.from("email_insights").delete().eq("message_id", id).eq("user_id", user.id).eq("status", "suggested");
  if (analysis.insights.length) {
    const { error } = await supabase.from("email_insights").insert(analysis.insights.map((i) => ({
      user_id: user.id, message_id: id, kind: i.kind, title: i.title.slice(0, 300), details: i.details,
      confidence: Math.max(0, Math.min(1, Number(i.confidence) || 0)),
    })));
    if (error) return { ok: false, error: error.message };
  }
  await supabase.from("email_messages").update({
    ai_summary: analysis.summary.slice(0, 2000), ai_analyzed_at: new Date().toISOString(),
    awaiting_reply: analysis.needs_reply || msg.awaiting_reply,
  }).eq("id", id);
  return done(`${analysis.method === "ai" ? "AI analysis" : "Rule-based analysis (AI not configured)"} found ${analysis.insights.length} suggestion(s)`);
}

export async function dismissInsight(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_insights").update({ status: "dismissed" }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Suggestion dismissed");
}

/** Marks a suggestion accepted after the user created the record from the pre-filled form. */
export async function markInsightAccepted(id: string, recordType: string, recordId: string | null): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_insights").update({ status: "accepted", created_record_type: recordType, created_record_id: recordId }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Suggestion accepted");
}

export async function setEmailFlags(id: string, patch: { awaiting_reply?: boolean; is_unread?: boolean; is_important?: boolean }): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_messages").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Updated");
}

export async function setFollowUp(id: string, local: string | null): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const at = local ? localInputToUtc(local, profile.timezone) : null;
  if (at && Number.isNaN(at.getTime())) return { ok: false, error: "Invalid date" };
  const { error } = await supabase.from("email_messages").update({ follow_up_at: at?.toISOString() ?? null }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await replanEntity(supabase, user.id, "email", id);
  return done(at ? "Follow-up reminder set" : "Follow-up cleared");
}

export async function deleteManualEmail(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_messages").delete().eq("id", id).eq("user_id", user.id).in("source", ["manual", "demo"]);
  if (error) return { ok: false, error: error.message };
  return done("Removed from LifePilot (your mailbox is unaffected)");
}

// Drafts ------------------------------------------------------------------------
const draftSchema = z.object({
  id: z.uuid().optional().or(z.literal("")),
  message_id: optUuid,
  to: z.string().trim().min(3, "Add at least one recipient"),
  subject: z.string().trim().max(500),
  body: z.string().max(50_000),
});

export async function saveDraft(_p: unknown, fd: FormData): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const parsed = draftSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid draft" };
  const to = parsed.data.to.split(/[,;\s]+/).filter(Boolean);
  if (to.some((t) => !z.email().safeParse(t).success)) return { ok: false, error: "One or more recipient addresses are invalid" };
  let accountId: string | null = null;
  if (parsed.data.message_id) {
    const { data: m } = await supabase.from("email_messages").select("account_id").eq("id", parsed.data.message_id).single();
    accountId = m?.account_id ?? null;
  }
  const row = { user_id: user.id, message_id: parsed.data.message_id, account_id: accountId, to_emails: to, subject: parsed.data.subject, body: parsed.data.body };
  const res = parsed.data.id
    ? await supabase.from("email_drafts").update(row).eq("id", parsed.data.id).eq("user_id", user.id).select("id").single()
    : await supabase.from("email_drafts").insert(row).select("id").single();
  if (res.error) return { ok: false, error: res.error.message };
  return done("Draft saved in LifePilot", { id: res.data.id });
}

export async function generateReplyDraft(messageId: string, instructions: string): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_bucket: "reply_draft", p_limit: 20, p_window_seconds: 3600 });
  if (allowed === false) return { ok: false, error: "Draft limit reached. Try again later." };
  const { data: msg } = await supabase.from("email_messages").select("*").eq("id", messageId).eq("user_id", user.id).single<EmailMessage>();
  if (!msg) return { ok: false, error: "Email not found" };
  const { chatCompletion } = await import("@/lib/ai/openai");
  try {
    const body = await fetchMessageBody(user.id, msg);
    const { message } = await chatCompletion({
      messages: [
        { role: "system", content: `Draft a concise, professional email reply on behalf of ${profile.full_name ?? "the user"}. Plain text only, no subject line. Do not invent facts, commitments, prices or dates that the user didn't provide; use [placeholders] where information is needed.` },
        { role: "user", content: `Original email from ${msg.from_name ?? msg.from_email}:\nSubject: ${msg.subject}\n\n${body.slice(0, 8000)}\n\nInstructions for the reply: ${instructions || "Reply appropriately."}` },
      ],
      maxTokens: 700,
      temperature: 0.4,
    });
    const { data, error } = await supabase.from("email_drafts").insert({
      user_id: user.id, message_id: msg.id, account_id: msg.account_id, to_emails: msg.from_email ? [msg.from_email] : [],
      subject: msg.subject.toLowerCase().startsWith("re:") ? msg.subject : `Re: ${msg.subject}`, body: message.content ?? "",
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await supabase.from("ai_action_logs").insert({
      user_id: user.id, tool_name: "generate_reply_draft", summary: `Generated reply draft for “${msg.subject}”`,
      arguments: { message_id: msg.id, instructions }, status: "executed", result: { draft_id: data.id }, decided_at: new Date().toISOString(),
    });
    return done("Draft generated — review and edit before saving or sending", { id: data.id });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteDraft(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_drafts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Draft deleted");
}

/** Copies a draft into the provider's Drafts folder (does not send). */
export async function saveDraftToProvider(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { data: d } = await supabase.from("email_drafts").select("*, email_messages(provider_message_id, thread_id)").eq("id", id).eq("user_id", user.id).single();
  if (!d) return { ok: false, error: "Draft not found" };
  if (!d.account_id) return { ok: false, error: "This draft isn't linked to a connected mailbox. Copy the text into your email app instead." };
  try {
    const { token, provider, userId } = await getAccessToken(d.account_id);
    if (userId !== user.id) return { ok: false, error: "Not authorised" };
    const providerDraftId = await ops.createDraft(provider, token, {
      to: d.to_emails, subject: d.subject, body: d.body,
      replyToProviderId: d.email_messages?.provider_message_id ?? null, threadId: d.email_messages?.thread_id ?? null,
    });
    await supabase.from("email_drafts").update({ status: "saved_to_provider", provider_draft_id: providerDraftId, last_error: null }).eq("id", id);
    await supabase.rpc("log_audit", { p_action: "email_draft_saved_to_provider", p_entity_type: "email_drafts", p_entity_id: id, p_metadata: { provider } });
    return done(`Saved to your ${provider === "google" ? "Gmail" : "Outlook"} drafts`);
  } catch (e) {
    await supabase.from("email_drafts").update({ status: "failed", last_error: (e as Error).message }).eq("id", id);
    return { ok: false, error: (e as Error).message };
  }
}

/** Sends a draft. Requires the explicit confirmation flag set by the UI's confirm dialog. */
export async function sendDraft(id: string, confirmed: boolean): Promise<ActionResult<unknown>> {
  if (!confirmed) return { ok: false, error: "Sending requires explicit confirmation." };
  const { supabase, user } = await requireUser();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_bucket: "send_email", p_limit: 20, p_window_seconds: 3600 });
  if (allowed === false) return { ok: false, error: "Send limit reached. Try again later." };
  const first = await saveDraftToProvider(id);
  if (!first.ok) return first;
  const { data: d } = await supabase.from("email_drafts").select("*").eq("id", id).eq("user_id", user.id).single();
  try {
    const { token, provider } = await getAccessToken(d.account_id);
    await ops.sendDraft(provider, token, d.provider_draft_id);
    await supabase.from("email_drafts").update({ status: "sent" }).eq("id", id);
    if (d.message_id) await supabase.from("email_messages").update({ awaiting_reply: false }).eq("id", d.message_id);
    await supabase.rpc("log_audit", { p_action: "email_sent", p_entity_type: "email_drafts", p_entity_id: id, p_metadata: { to: d.to_emails, subject: d.subject } });
    return done("Email sent");
  } catch (e) {
    await supabase.from("email_drafts").update({ status: "failed", last_error: (e as Error).message }).eq("id", id);
    return { ok: false, error: `Send failed: ${(e as Error).message}` };
  }
}

export async function listInsightsFor(messageId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("email_insights").select("*").eq("message_id", messageId).eq("user_id", user.id).order("created_at");
  return (data ?? []) as EmailInsight[];
}
