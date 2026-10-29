import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, IntegrationError, markAccountError } from "@/lib/integrations/tokens";
import { ops } from "@/lib/integrations";

const AUTOMATED = /(no-?reply|do-?not-?reply|notifications?|mailer-daemon|newsletter|marketing|updates?)@/i;

/**
 * Syncs recent inbox metadata (sender, subject, snippet, flags). Message bodies
 * are NOT stored; they are fetched on demand when the user opens or analyses a
 * message. User-set fields (follow-ups, awaiting reply, AI output) are preserved.
 */
export async function syncMailAccount(accountId: string) {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("email_accounts").select("*").eq("id", accountId).single();
  if (!acc || !acc.mail_sync_enabled) return { inserted: 0, updated: 0 };
  try {
    const { token, provider } = await getAccessToken(accountId);
    const messages = await ops.listMessages(provider, token);
    const ids = messages.map((m) => m.providerId);
    const { data: existing } = ids.length
      ? await admin.from("email_messages").select("id, provider_message_id").eq("account_id", accountId).in("provider_message_id", ids)
      : { data: [] as { id: string; provider_message_id: string }[] };
    const known = new Map((existing ?? []).map((e) => [e.provider_message_id, e.id]));

    const inserts = messages.filter((m) => !known.has(m.providerId)).map((m) => ({
      user_id: acc.user_id,
      account_id: accountId,
      provider_message_id: m.providerId,
      thread_id: m.threadId,
      from_name: m.fromName,
      from_email: m.fromEmail,
      to_emails: m.to,
      subject: m.subject.slice(0, 1000),
      snippet: m.snippet.slice(0, 1000),
      received_at: m.receivedAt,
      is_unread: m.isUnread,
      is_important: m.isImportant,
      // Heuristic: an important, unread message from a person probably needs a reply.
      awaiting_reply: m.isImportant && m.isUnread && !!m.fromEmail && !AUTOMATED.test(m.fromEmail) && m.fromEmail !== acc.email_address,
      source: "sync",
    }));
    if (inserts.length) {
      const { error } = await admin.from("email_messages").upsert(inserts, { onConflict: "account_id,provider_message_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    let updated = 0;
    for (const m of messages) {
      const id = known.get(m.providerId);
      if (!id) continue;
      await admin.from("email_messages").update({ is_unread: m.isUnread, is_important: m.isImportant }).eq("id", id).eq("user_id", acc.user_id);
      updated++;
    }
    await admin.from("email_accounts").update({ last_mail_sync_at: new Date().toISOString(), status: "connected", last_error: null }).eq("id", accountId);
    return { inserted: inserts.length, updated };
  } catch (e) {
    const err = e as IntegrationError;
    await markAccountError(accountId, `Mail sync failed: ${err.message}`);
    throw err;
  }
}

/** Fetches a message body on demand (manual messages already hold their text). */
export async function fetchMessageBody(userId: string, message: { account_id: string | null; provider_message_id: string | null; body_text: string | null; snippet: string | null }) {
  if (!message.account_id || !message.provider_message_id) return message.body_text ?? message.snippet ?? "";
  const { token, provider, userId: owner } = await getAccessToken(message.account_id);
  if (owner !== userId) throw new IntegrationError("Not authorised");
  return ops.messageBody(provider, token, message.provider_message_id);
}
