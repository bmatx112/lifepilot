import "server-only";
import { env, features } from "@/lib/env";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI assistant is not configured. Set OPENAI_API_KEY on the server to enable it.");
  }
}

/** Minimal Chat Completions client (server-only; the key never reaches the browser). */
export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  json?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
}) {
  if (!features.ai()) throw new AiNotConfiguredError();
  const body: Record<string, unknown> = {
    model: env.openaiModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1200,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
    body.parallel_tool_calls = true;
  }
  if (opts.json) body.response_format = { type: "json_schema", json_schema: { name: opts.json.name, schema: opts.json.schema, strict: true } };

  const res = await fetch(`${env.openaiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `OpenAI request failed (${res.status})`;
    throw new Error(res.status === 429 ? "The AI service is rate-limited or out of quota. Please try again later." : msg);
  }
  const choice = json.choices?.[0];
  return {
    message: choice?.message as { content: string | null; tool_calls?: ToolCall[] },
    usage: json.usage as { prompt_tokens: number; completion_tokens: number } | undefined,
  };
}
