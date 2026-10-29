"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { AiActionLog } from "@/lib/types";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  actions?: AiActionLog[];
  error?: boolean;
}

export const EXAMPLE_PROMPTS = [
  "What do I need to do today?",
  "How much have I spent this month?",
  "Which bills must I pay this week?",
  "Show me which budgets are almost exhausted",
  "What business tasks are overdue?",
  "Summarise my important emails",
  "What deadlines are coming up?",
  "Help me plan my day",
  "Prepare my weekly business report",
  "Schedule a meeting for next Tuesday at 10:00",
];

/** Renders **bold** and keeps line breaks; no HTML injection. */
function RichText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </div>
  );
}

export function ActionCard({ action, onChange }: { action: AiActionLog; onChange: (a: AiActionLog) => void }) {
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const router = useRouter();
  const decide = async (decision: "confirm" | "reject") => {
    setBusy(decision);
    try {
      const res = await fetch(`/api/ai/actions/${action.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const json = await res.json();
      if (!res.ok && json.status !== "failed") throw new Error(json.error ?? "Request failed");
      if (json.status === "executed") {
        toast.success(json.message ?? "Done");
        (json.warnings ?? []).forEach((w: string) => toast.warning(w));
      } else if (json.status === "failed") toast.error(json.error);
      onChange({ ...action, status: json.status, error: json.error ?? null });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-2 rounded-lg border border-accent/30 bg-accent-soft/50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Proposed action</p>
          <p className="mt-0.5 text-foreground">{action.summary}</p>
          {action.error ? <p className="mt-1 text-xs text-destructive">{action.error}</p> : null}
        </div>
        <Badge tone={statusTone(action.status)}>{action.status === "proposed" ? "awaiting you" : action.status}</Badge>
      </div>
      {action.status === "proposed" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="accent" onClick={() => decide("confirm")} disabled={!!busy}>
            {busy === "confirm" ? <Loader2 className="animate-spin" /> : <Check />} Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("reject")} disabled={!!busy}>
            {busy === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantChat({
  initialConversationId = null,
  initialMessages = [],
  aiEnabled,
  compact,
  onConversation,
}: {
  initialConversationId?: string | null;
  initialMessages?: ChatMsg[];
  aiEnabled: boolean;
  compact?: boolean;
  onConversation?: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setPending(true);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, message: msg }) });
      const json = await res.json();
      if (json.conversationId && json.conversationId !== conversationId) {
        setConversationId(json.conversationId);
        onConversation?.(json.conversationId);
      }
      if (!res.ok) throw new Error(json.error ?? "The assistant is unavailable");
      setMessages((m) => [...m, { role: "assistant", content: json.reply, actions: json.actions }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setPending(false);
    }
  };

  const updateAction = (a: AiActionLog) =>
    setMessages((ms) => ms.map((m) => (m.actions ? { ...m, actions: m.actions.map((x) => (x.id === a.id ? a : x)) } : m)));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "h-full" : "h-[calc(100dvh-12rem)] md:h-[calc(100dvh-10rem)]")}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {!aiEnabled ? (
          <Alert tone="warning" title="AI assistant not configured">
            Set <code>OPENAI_API_KEY</code> on the server to enable the assistant. Everything else in LifePilot works without it.
          </Alert>
        ) : null}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-accent-soft p-3 text-accent"><Sparkles className="size-5" /></div>
            <div>
              <p className="font-medium">Ask about your day, money, tasks or email</p>
              <p className="text-xs text-muted-foreground">Answers come from your own LifePilot records. Changes always need your confirmation.</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
              {EXAMPLE_PROMPTS.slice(0, compact ? 5 : 10).map((p) => (
                <button key={p} onClick={() => send(p)} disabled={!aiEnabled} className="rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-muted disabled:opacity-50">{p}</button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
            {m.role === "assistant" ? <div className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:flex"><Bot className="size-4" /></div> : null}
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
              m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "border border-destructive/30 bg-destructive-soft text-destructive" : "border border-border bg-card")}>
              <RichText text={m.content} />
              {m.actions?.map((a) => <ActionCard key={a.id} action={a} onChange={updateAction} />)}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking your records…</div>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="mt-3 flex items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">Message</label>
        <textarea
          id="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={!aiEnabled}
          placeholder={aiEnabled ? "Ask LifePilot…" : "AI assistant not configured"}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Button type="submit" variant="accent" size="icon" disabled={!input.trim() || pending || !aiEnabled} aria-label="Send">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </div>
  );
}
