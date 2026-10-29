import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { fmt } from "@/lib/dates";
import { PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { AssistantPageChat } from "@/components/assistant/page-chat";
import type { ChatMsg } from "@/components/assistant/chat";
import type { AiActionLog } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const cid = typeof sp.c === "string" ? sp.c : null;
  const { data: convs } = await supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30);
  let initial: ChatMsg[] = [];
  if (cid) {
    const [{ data: msgs }, { data: actions }] = await Promise.all([
      supabase.from("ai_messages").select("role, content, action_ids").eq("conversation_id", cid).order("created_at").limit(200),
      supabase.from("ai_action_logs").select("*").eq("conversation_id", cid),
    ]);
    const byId = new Map(((actions ?? []) as AiActionLog[]).map((a) => [a.id, a]));
    initial = (msgs ?? []).map((m) => ({ role: m.role, content: m.content, actions: (m.action_ids ?? []).map((id: string) => byId.get(id)).filter(Boolean) as AiActionLog[] }));
  }
  return (
    <>
      <PageHeader title="AI Assistant" description="Answers come only from your LifePilot records. Any change it proposes waits for your confirmation and is logged." />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="hidden lg:block">
          <Link href="/assistant" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mb-2 w-full")}><Plus /> New conversation</Link>
          <ul className="space-y-0.5">
            {(convs ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/assistant?c=${c.id}`} className={cn("block rounded-md px-2 py-1.5 text-sm hover:bg-muted", c.id === cid && "bg-muted font-medium")}>
                  <span className="block truncate">{c.title}</span>
                  <span className="text-[11px] text-muted-foreground">{fmt(c.updated_at, profile.timezone, "d MMM HH:mm")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3 shadow-card sm:p-4">
          <AssistantPageChat key={cid ?? "new"} conversationId={cid} initial={initial} aiEnabled={features.ai()} />
        </div>
      </div>
    </>
  );
}
