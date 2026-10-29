import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { fetchMessageBody } from "@/lib/integrations/mail-sync";
import { EmailDetail } from "@/components/email/email-detail";
import type { EmailDraft, EmailInsight, EmailMessage } from "@/lib/types";

export const metadata = { title: "Email" };

export default async function EmailDetailPage({ params }: PageProps<"/email/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: msg } = await supabase.from("email_messages").select("*").eq("id", id).eq("user_id", user.id).maybeSingle<EmailMessage>();
  if (!msg) notFound();
  const [insights, drafts, account] = await Promise.all([
    supabase.from("email_insights").select("*").eq("message_id", id).order("created_at"),
    supabase.from("email_drafts").select("*").eq("message_id", id).order("created_at", { ascending: false }),
    msg.account_id ? supabase.from("email_accounts").select("provider, email_address, status").eq("id", msg.account_id).single() : Promise.resolve({ data: null }),
  ]);
  // Bodies of synced messages are fetched live from the provider and never stored.
  let body: string | null = null;
  let bodyError: string | null = null;
  try {
    body = await fetchMessageBody(user.id, msg);
  } catch (e) {
    bodyError = (e as Error).message;
  }
  if (msg.is_unread && msg.source !== "sync") await supabase.from("email_messages").update({ is_unread: false }).eq("id", id);
  return (
    <EmailDetail
      message={msg}
      body={body}
      bodyError={bodyError}
      insights={(insights.data ?? []) as EmailInsight[]}
      drafts={(drafts.data ?? []) as EmailDraft[]}
      account={account.data as { provider: string; email_address: string; status: string } | null}
      aiEnabled={features.ai()}
    />
  );
}
