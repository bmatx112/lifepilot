"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, Clock, ListTodo, Loader2, Mail, Receipt, Reply, Send, Sparkles, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ActionButton, SubmitButton, useFormAction } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { EventDialog } from "@/components/calendar/event-dialog";
import { BillDialog } from "@/components/finance/forms";
import { useLookups } from "@/components/layout/lookups";
import {
  analyzeEmailAction, deleteDraft, deleteManualEmail, dismissInsight, generateReplyDraft, markInsightAccepted, saveDraft,
  saveDraftToProvider, sendDraft, setEmailFlags, setFollowUp,
} from "@/app/actions/email";
import { fmt, utcToLocalInput, addDaysToDateString, todayInTz } from "@/lib/dates";
import type { EmailDraft, EmailInsight, EmailMessage } from "@/lib/types";

type D = { due_date?: string | null; due_time?: string | null; start?: string | null; end?: string | null; location?: string | null; amount?: number | null; currency?: string | null; invoice_number?: string | null; counterparty?: string | null; evidence?: string };

const KIND_META: Record<string, { label: string; icon: React.ReactNode; action: string }> = {
  task: { label: "Task", icon: <ListTodo />, action: "Create task" },
  deadline: { label: "Deadline", icon: <Clock />, action: "Create task" },
  follow_up: { label: "Follow-up", icon: <Clock />, action: "Create task" },
  reply_needed: { label: "Reply needed", icon: <Reply />, action: "Create reply task" },
  event: { label: "Meeting / event", icon: <CalendarPlus />, action: "Add to calendar" },
  payable: { label: "Bill to pay", icon: <Receipt />, action: "Add bill" },
  receivable: { label: "Money owed to you", icon: <Receipt />, action: "Add receivable" },
};

function addHour(local: string) {
  const [d, t] = local.split("T");
  const h = Number(t.slice(0, 2)) + 1;
  return h >= 24 ? `${addDaysToDateString(d, 1)}T00:${t.slice(3, 5)}` : `${d}T${String(h).padStart(2, "0")}:${t.slice(3, 5)}`;
}

export function EmailDetail({ message: m, body, bodyError, insights, drafts, account, aiEnabled }: {
  message: EmailMessage; body: string | null; bodyError: string | null; insights: EmailInsight[]; drafts: EmailDraft[];
  account: { provider: string; email_address: string; status: string } | null; aiEnabled: boolean;
}) {
  const { timezone } = useLookups();
  const router = useRouter();
  const [accepting, setAccepting] = useState<EmailInsight | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<EmailDraft | "new" | null>(null);
  const [sending, setSending] = useState<EmailDraft | null>(null);
  const [pending, start] = useTransition();
  const [followLocal, setFollowLocal] = useState(m.follow_up_at ? utcToLocalInput(m.follow_up_at, timezone) : `${addDaysToDateString(todayInTz(timezone), 2)}T09:00`);

  const suggested = insights.filter((i) => i.status === "suggested");
  const reviewed = insights.filter((i) => i.status !== "suggested");
  const accepted = (type: string, id: string | null) => {
    if (!accepting) return;
    const ins = accepting;
    setAccepting(null);
    markInsightAccepted(ins.id, type, id).then(() => router.refresh());
  };

  const d = (accepting?.details ?? {}) as D;
  const dueLocal = d.due_date ? `${d.due_date}T${d.due_time ?? "09:00"}` : undefined;
  const startLocal = d.start ?? dueLocal;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/email" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Email</Link>
        <div className="flex flex-wrap gap-1">
          <ActionButton size="sm" variant="ghost" action={() => setEmailFlags(m.id, { is_important: !m.is_important })}><Star className={m.is_important ? "fill-warning text-warning" : ""} /> {m.is_important ? "Important" : "Mark important"}</ActionButton>
          <ActionButton size="sm" variant="ghost" action={() => setEmailFlags(m.id, { awaiting_reply: !m.awaiting_reply })}><Reply /> {m.awaiting_reply ? "Awaiting reply ✓" : "Needs reply"}</ActionButton>
          {m.source !== "sync" ? <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => deleteManualEmail(m.id)} onDone={(r) => r.ok && router.push("/email")} confirm={{ title: "Remove this email from LifePilot?" }} confirmLabel="Remove"><Trash2 /></ActionButton> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="text-base">{m.subject}</CardTitle>
              <CardDescription>
                From {m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email ?? "unknown"} · {fmt(m.received_at, timezone, "EEE d MMM yyyy, HH:mm")}
                {account ? ` · via ${account.email_address}` : m.source === "manual" ? " · added manually" : ""}
              </CardDescription>
            </div>
            {m.is_demo ? <Badge tone="warning">Demo</Badge> : null}
          </CardHeader>
          <CardContent>
            {bodyError ? <Alert tone="warning" title="Couldn't load the full message">{bodyError}. Showing the preview instead.</Alert> : null}
            <div className="mt-2 max-h-[60dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">{body ?? m.snippet ?? "(empty)"}</div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Summary & suggestions</CardTitle>
                <CardDescription>{m.ai_analyzed_at ? `Analysed ${fmt(m.ai_analyzed_at, timezone, "d MMM HH:mm")}` : "Not analysed yet"} · {aiEnabled ? "AI" : "rule-based"}</CardDescription></div>
              <ActionButton size="sm" variant={m.ai_analyzed_at ? "outline" : "accent"} action={() => analyzeEmailAction(m.id)}>{m.ai_analyzed_at ? "Re-analyse" : "Analyse"}</ActionButton>
            </CardHeader>
            <CardContent className="space-y-3">
              {m.ai_summary ? <p className="rounded-lg bg-accent-soft/50 p-2.5 text-sm">{m.ai_summary}</p> : null}
              {suggested.length ? (
                <ul className="space-y-2">
                  {suggested.map((i) => {
                    const meta = KIND_META[i.kind];
                    const det = i.details as D;
                    return (
                      <li key={i.id} className="rounded-lg border border-border p-2.5 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-accent [&_svg]:size-4">{meta.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{meta.label}{i.confidence !== null ? ` · ${Math.round(Number(i.confidence) * 100)}% confidence` : ""}</p>
                            <p className="font-medium">{i.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {[det.due_date && `Due ${det.due_date}${det.due_time ? ` ${det.due_time}` : ""}`, det.start && `Starts ${det.start.replace("T", " ")}`, det.amount != null && `${det.currency ?? ""} ${det.amount}`, det.invoice_number && `Ref ${det.invoice_number}`, det.location].filter(Boolean).join(" · ")}
                            </p>
                            {det.evidence ? <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">“{det.evidence}”</blockquote> : null}
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-1">
                          <ActionButton size="sm" variant="ghost" action={() => dismissInsight(i.id)}><X /> Dismiss</ActionButton>
                          <Button size="sm" variant="accent" onClick={() => setAccepting(i)}><Check /> Review & {meta.action.toLowerCase()}</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : m.ai_analyzed_at ? <EmptyState title="No pending suggestions" /> : <p className="text-sm text-muted-foreground">Analyse this email to find deadlines, meetings, invoices and commitments. Nothing is created until you review it.</p>}
              {reviewed.length ? (
                <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Reviewed ({reviewed.length})</summary>
                  <ul className="mt-1 space-y-1">{reviewed.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.title}</span><Badge tone={statusTone(i.status === "accepted" ? "completed" : "cancelled")}>{i.status}</Badge></li>)}</ul>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-2"><Clock className="size-4 text-accent" /> Follow-up reminder</CardTitle><CardDescription>{m.follow_up_at ? `Set for ${fmt(m.follow_up_at, timezone, "EEE d MMM, HH:mm")}` : "No follow-up set"}</CardDescription></div></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input type="datetime-local" value={followLocal} onChange={(e) => setFollowLocal(e.target.value)} className="w-auto" aria-label="Follow-up time" />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setFollowUp(m.id, followLocal); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Set</Button>
              {m.follow_up_at ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await setFollowUp(m.id, null); if (r.ok) toast.success(r.message); else toast.error(r.error); })}>Clear</Button> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div><CardTitle className="flex items-center gap-2"><Mail className="size-4 text-accent" /> Reply drafts</CardTitle><CardDescription>Nothing is sent without your explicit confirmation.</CardDescription></div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditDraft("new")}>Write</Button>
                <Button size="sm" variant="accent" onClick={() => setReplyOpen(true)} disabled={!aiEnabled} title={aiEnabled ? undefined : "AI not configured"}><Sparkles /> AI draft</Button>
              </div>
            </CardHeader>
            <CardContent>
              {drafts.length ? (
                <ul className="space-y-2">
                  {drafts.map((dr) => (
                    <li key={dr.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{dr.subject}</p><Badge tone={statusTone(dr.status === "sent" ? "completed" : dr.status === "failed" ? "failed" : "pending")}>{dr.status.replace(/_/g, " ")}</Badge></div>
                      <p className="text-xs text-muted-foreground">To: {dr.to_emails.join(", ")}</p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs">{dr.body}</p>
                      {dr.last_error ? <p className="mt-1 text-xs text-destructive">{dr.last_error}</p> : null}
                      {dr.status !== "sent" ? (
                        <div className="mt-2 flex flex-wrap justify-end gap-1">
                          <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => deleteDraft(dr.id)}><Trash2 /></ActionButton>
                          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(dr.body); toast.success("Copied"); }}>Copy</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditDraft(dr)}>Edit</Button>
                          {dr.account_id ? <>
                            <ActionButton size="sm" variant="outline" action={() => saveDraftToProvider(dr.id)}>Save to {account?.provider === "microsoft" ? "Outlook" : "Gmail"}</ActionButton>
                            <Button size="sm" variant="accent" onClick={() => setSending(dr)}><Send /> Send…</Button>
                          </> : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No drafts yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {accepting && ["task", "deadline", "follow_up", "reply_needed"].includes(accepting.kind) ? (
        <TaskDialog open onOpenChange={(o) => !o && setAccepting(null)}
          defaults={{ title: accepting.title, description: `From email “${m.subject}” (${m.from_email ?? "unknown sender"})${d.evidence ? `\n\n“${d.evidence}”` : ""}`, due_local: dueLocal, priority: accepting.kind === "deadline" ? "high" : "medium", business_id: m.business_id, source: "email", source_ref: m.id }}
          onSaved={(r) => accepted("task", r.ok ? ((r.data as { id?: string })?.id ?? null) : null)} />
      ) : null}
      {accepting?.kind === "event" ? (
        <EventDialog open onOpenChange={(o) => !o && setAccepting(null)} onSaved={() => accepted("event", null)}
          defaults={{ title: accepting.title, start_local: startLocal, end_local: d.end ?? (startLocal ? addHour(startLocal) : undefined), location: d.location ?? undefined, description: `From email “${m.subject}”`, business_id: m.business_id, source: "email", source_ref: m.id }} />
      ) : null}
      {accepting && (accepting.kind === "payable" || accepting.kind === "receivable") ? (
        <BillDialog open onOpenChange={(o) => !o && setAccepting(null)} onSaved={() => accepted("bill", null)}
          defaults={{ kind: accepting.kind, title: accepting.title, amount: d.amount ?? undefined, currency: d.currency ?? undefined, due_date: d.due_date ?? undefined, invoice_number: d.invoice_number, business_id: m.business_id, notes: `From email “${m.subject}” (${m.from_email ?? ""})` }} />
      ) : null}

      {replyOpen ? <AiReplyDialog messageId={m.id} onOpenChange={setReplyOpen} /> : null}
      {editDraft ? <DraftDialog draft={editDraft === "new" ? null : editDraft} message={m} onOpenChange={(o) => !o && setEditDraft(null)} /> : null}
      {sending ? (
        <Dialog open onOpenChange={(o) => !o && setSending(null)}>
          <DialogContent title="Send this email?" description={`From ${account?.email_address ?? "your connected mailbox"} to ${sending.to_emails.join(", ")}`}>
            <div className="space-y-3">
              <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"><p className="mb-2 font-medium">{sending.subject}</p>{sending.body}</div>
              <Alert tone="warning">This will send a real email on your behalf. It cannot be unsent.</Alert>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSending(null)}>Cancel</Button>
                <ActionButton variant="accent" action={() => sendDraft(sending.id, true)} onDone={(r) => r.ok && setSending(null)}><Send /> Yes, send it</ActionButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function AiReplyDialog({ messageId, onOpenChange }: { messageId: string; onOpenChange: (o: boolean) => void }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="Draft a reply with AI" description="The draft is saved for you to review and edit. It is not sent.">
        <div className="space-y-3">
          <Field label="What should the reply say?" htmlFor="ai-instr" hint="e.g. Accept the meeting, propose Thursday 10:00 instead, ask for the invoice in PDF.">
            <Textarea id="ai-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={1000} />
          </Field>
          <div className="flex justify-end">
            <Button variant="accent" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await generateReplyDraft(messageId, instructions);
              setBusy(false);
              if (r.ok) { toast.success(r.message); onOpenChange(false); router.refresh(); } else toast.error(r.error);
            }}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate draft</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DraftDialog({ draft, message, onOpenChange }: { draft: EmailDraft | null; message: EmailMessage; onOpenChange: (o: boolean) => void }) {
  const { formAction, pending } = useFormAction(saveDraft, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={draft ? "Edit draft" : "Write a reply"} wide>
        <form onSubmit={formAction} className="grid gap-3">
          {draft ? <input type="hidden" name="id" value={draft.id} /> : null}
          <input type="hidden" name="message_id" value={message.id} />
          <Field label="To" htmlFor="dr-to" hint="Separate multiple addresses with commas"><Input id="dr-to" name="to" defaultValue={draft?.to_emails.join(", ") ?? message.from_email ?? ""} required /></Field>
          <Field label="Subject" htmlFor="dr-subj"><Input id="dr-subj" name="subject" defaultValue={draft?.subject ?? (message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`)} /></Field>
          <Field label="Message" htmlFor="dr-body"><Textarea id="dr-body" name="body" rows={10} defaultValue={draft?.body ?? ""} /></Field>
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">Save draft</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
