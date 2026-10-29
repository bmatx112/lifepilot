import { requireUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { EmailInbox } from "@/components/email/inbox";
import type { EmailAccount, EmailMessage } from "@/lib/types";

export const metadata = { title: "Email" };

export default async function EmailPage({ searchParams }: PageProps<"/email">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.replace(/[%,()"\\]/g, " ").trim().slice(0, 100) : "";
  const { supabase, user } = await requireUser();
  let query = supabase.from("email_messages").select("*").eq("user_id", user.id).order("received_at", { ascending: false });
  if (filter === "important") query = query.eq("is_important", true);
  if (filter === "unread") query = query.eq("is_unread", true);
  if (filter === "awaiting") query = query.eq("awaiting_reply", true);
  if (filter === "followup") query = query.not("follow_up_at", "is", null);
  if (filter === "analyzed") query = query.not("ai_analyzed_at", "is", null);
  if (filter === "manual") query = query.in("source", ["manual", "demo"]);
  if (q) query = query.or(`subject.ilike.%${q}%,from_email.ilike.%${q}%,from_name.ilike.%${q}%,snippet.ilike.%${q}%`);
  const [{ data }, { data: accounts }, { count: pending }] = await Promise.all([
    query.limit(200),
    supabase.from("email_accounts").select("*").eq("user_id", user.id),
    supabase.from("email_insights").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "suggested"),
  ]);
  return (
    <>
      <PageHeader title="Email" description="Synced inbox metadata and pasted emails, with summaries and suggested actions you review before anything is created." />
      <EmailInbox messages={(data ?? []) as EmailMessage[]} accounts={(accounts ?? []) as EmailAccount[]} filter={filter} q={q} pendingSuggestions={pending ?? 0} aiEnabled={features.ai()} integrationsConfigured={features.google() || features.microsoft()} />
    </>
  );
}
