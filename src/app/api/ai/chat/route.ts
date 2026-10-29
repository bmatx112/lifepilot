import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { runAssistant } from "@/lib/ai/assistant";
import { AiNotConfiguredError } from "@/lib/ai/openai";

const bodySchema = z.object({ conversationId: z.uuid().nullable().optional(), message: z.string().trim().min(1).max(4000) });

export async function POST(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: allowed } = await u.supabase.rpc("check_rate_limit", { p_bucket: "ai_chat", p_limit: 40, p_window_seconds: 600 });
  if (allowed === false) return NextResponse.json({ error: "You're sending messages too quickly. Please wait a few minutes." }, { status: 429 });

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data } = await u.supabase.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data, error } = await u.supabase.from("ai_conversations").insert({ user_id: u.user.id, title: parsed.data.message.slice(0, 80) }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = data.id as string;
  }
  const { data: history } = await u.supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(16);
  await u.supabase.from("ai_messages").insert({ user_id: u.user.id, conversation_id: conversationId, role: "user", content: parsed.data.message });

  try {
    const result = await runAssistant({
      supabase: u.supabase, userId: u.user.id, name: u.profile?.full_name ?? "there", tz: u.profile?.timezone ?? "UTC",
      currency: u.profile?.default_currency ?? "USD", conversationId,
      history: ((history ?? []) as { role: "user" | "assistant"; content: string }[]).reverse(), message: parsed.data.message,
    });
    await u.supabase.from("ai_messages").insert({
      user_id: u.user.id, conversation_id: conversationId, role: "assistant", content: result.reply || "(no response)",
      action_ids: result.proposed.map((p) => p.id),
    });
    await u.supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return NextResponse.json({ conversationId, reply: result.reply, actions: result.proposed, toolsUsed: result.toolsUsed });
  } catch (e) {
    const status = e instanceof AiNotConfiguredError ? 503 : 502;
    return NextResponse.json({ conversationId, error: (e as Error).message }, { status });
  }
}
