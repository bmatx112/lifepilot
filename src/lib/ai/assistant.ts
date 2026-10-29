import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatCompletion, type ChatMessage } from "@/lib/ai/openai";
import { ALL_TOOLS, runReadTool, summarizeProposal, WRITE_TOOL_NAMES, writeArgSchemas, type ToolContext } from "@/lib/ai/tools";
import { fmt } from "@/lib/dates";
import type { AiActionLog } from "@/lib/types";

const MAX_STEPS = 6;

function systemPrompt(name: string, tz: string, currency: string, businesses: { id: string; name: string }[]) {
  const now = new Date();
  return [
    `You are LifePilot, a personal and business assistant for ${name}.`,
    `Current local time: ${fmt(now, tz, "EEEE d MMMM yyyy, HH:mm")} (${tz}). Default currency: ${currency}.`,
    businesses.length ? `Businesses: ${businesses.map((b) => `${b.name} (id ${b.id})`).join("; ")}.` : "The user has no businesses set up.",
    "RULES:",
    "- Answer ONLY from data returned by tools. Never invent tasks, events, emails, amounts or dates. If a tool returns nothing, say so plainly.",
    "- Always call the relevant read tools before answering questions about the user's data.",
    "- Actions that change data (create_task, create_event, create_reminder, set_email_follow_up, draft_email_reply, record_transaction) are only PROPOSALS. After calling one, tell the user it is waiting for their confirmation below — do not claim it was done.",
    "- Never estimate or guess money amounts for record_transaction; only use amounts the user stated explicitly.",
    "- You cannot send emails. You may propose a draft; the user reviews and sends it themselves.",
    "- Resolve relative dates (\"next Tuesday\", \"tomorrow\") using the current local time above; use local times in yyyy-MM-ddTHH:mm. If a meeting length isn't given, assume 60 minutes.",
    "- Money totals are per currency; never add USD and ZWG together.",
    "- Be concise. Use short bullet lists. Format dates like 'Tue 3 Nov, 14:00'.",
  ].join("\n");
}

export async function runAssistant(opts: {
  supabase: SupabaseClient;
  userId: string;
  name: string;
  tz: string;
  currency: string;
  conversationId: string;
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}) {
  const { supabase, userId, tz, currency, conversationId } = opts;
  const { data: businesses } = await supabase.from("businesses").select("id, name").eq("user_id", userId).eq("archived", false);
  const ctx: ToolContext = { supabase, userId, tz, currency, conversationId };
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(opts.name, tz, currency, businesses ?? []) },
    ...opts.history.slice(-16),
    { role: "user", content: opts.message },
  ];
  const proposed: AiActionLog[] = [];
  const toolsUsed: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message } = await chatCompletion({ messages, tools: ALL_TOOLS, maxTokens: 1000 });
    if (!message.tool_calls?.length) {
      return { reply: message.content ?? "", proposed, toolsUsed };
    }
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
    for (const call of message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Invalid JSON arguments" }) });
        continue;
      }
      const name = call.function.name;
      toolsUsed.push(name);
      let result: unknown;
      if (WRITE_TOOL_NAMES.has(name)) {
        const parsed = writeArgSchemas[name].safeParse(args);
        if (!parsed.success) {
          result = { error: "Invalid arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
        } else {
          const { data: log, error } = await supabase.from("ai_action_logs").insert({
            user_id: userId, conversation_id: conversationId, tool_name: name, arguments: parsed.data,
            summary: summarizeProposal(name, parsed.data as Record<string, unknown>), status: "proposed",
          }).select("*").single();
          if (error) result = { error: error.message };
          else {
            proposed.push(log as AiActionLog);
            result = { status: "awaiting_user_confirmation", action_id: log.id, summary: log.summary };
          }
        }
      } else {
        try {
          result = await runReadTool(name, args, ctx);
        } catch (e) {
          result = { error: (e as Error).message };
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 24_000) });
    }
  }
  return { reply: "I couldn't complete that request within the allowed number of steps. Please try a more specific question.", proposed, toolsUsed };
}
