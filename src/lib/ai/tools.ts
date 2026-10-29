import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { addDaysToDateString, endOfLocalDay, fmt, startOfLocalDay, todayInTz } from "@/lib/dates";
import { expensesByCategory, monthRange, outstandingCents, periodRange, summarize } from "@/lib/finance";
import { formatCents, type CurrencyTotals } from "@/lib/money";
import { getBudgetStatuses, getEventsBetween } from "@/lib/data/overview";
import type { ToolDef } from "@/lib/ai/openai";
import type { Bill, Business, Category, EmailMessage, Task, Transaction } from "@/lib/types";

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  tz: string;
  currency: string;
  conversationId: string | null;
}

const fmtTotals = (t: CurrencyTotals) =>
  Object.entries(t).map(([c, v]) => formatCents(v, c)).join(" + ") || "0";

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

const businessParam = { type: "string", description: 'Scope: "all" (default), "personal", or a business name/id.' };

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export const READ_TOOLS: ToolDef[] = [
  fn("get_tasks", "List the user's tasks.", {
    scope: { type: "string", enum: ["today", "overdue", "upcoming_7_days", "all_open", "completed_recently"] },
    business: businessParam,
    limit: { type: "integer", minimum: 1, maximum: 50 },
  }, ["scope"]),
  fn("get_schedule", "Calendar events (recurring events expanded) between two local dates inclusive.", {
    from_date: { type: "string", description: "yyyy-MM-dd" },
    to_date: { type: "string", description: "yyyy-MM-dd" },
  }, ["from_date", "to_date"]),
  fn("get_financial_summary", "Income, expenses, net cash flow and top expense categories for a period, from stored transactions only.", {
    period: { type: "string", enum: ["this_month", "last_month", "this_quarter", "this_year", "custom"] },
    from_date: { type: "string" },
    to_date: { type: "string", description: "inclusive" },
    business: businessParam,
  }, ["period"]),
  fn("get_budget_status", "Active budgets with spent, remaining and utilisation percent for the current period.", {}),
  fn("get_bills", "Open bills (payables) and/or receivables with due dates.", {
    kind: { type: "string", enum: ["payable", "receivable", "both"] },
    within_days: { type: "integer", minimum: 0, maximum: 365, description: "Due within N days from today (overdue always included)" },
  }, ["kind"]),
  fn("search_transactions", "Search recorded transactions.", {
    query: { type: "string", description: "Text to match in description/counterparty" },
    type: { type: "string", enum: ["income", "expense", "any"] },
    from_date: { type: "string" },
    to_date: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 50 },
  }),
  fn("search_emails", "Search synced/added email metadata and AI summaries.", {
    query: { type: "string" },
    filter: { type: "string", enum: ["any", "important_unread", "awaiting_reply", "follow_up"] },
    limit: { type: "integer", minimum: 1, maximum: 25 },
  }),
  fn("get_email", "Get one email's metadata, summary and extracted suggestions.", { email_id: { type: "string" } }, ["email_id"]),
  fn("get_deadlines", "Upcoming deadlines: task due dates, bill due dates, project due dates and deadline events.", {
    days: { type: "integer", minimum: 1, maximum: 120 },
  }),
  fn("list_businesses", "List the user's businesses/projects with ids.", {}),
  fn("get_business_report", "Weekly/monthly business performance: income, expenses, net, open receivables, task completion.", {
    business: businessParam,
    period: { type: "string", enum: ["last_7_days", "this_month", "last_month"] },
  }, ["period"]),
];

export const WRITE_TOOLS: ToolDef[] = [
  fn("create_task", "PROPOSE creating a task. The user must confirm before it is saved.", {
    title: { type: "string" },
    description: { type: "string" },
    due_local: { type: "string", description: "Local date-time yyyy-MM-ddTHH:mm, optional" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    business_id: { type: "string", description: "Business id from list_businesses, omit for personal" },
    source_email_id: { type: "string", description: "If created from an email" },
  }, ["title"]),
  fn("create_event", "PROPOSE scheduling a calendar event/meeting. The user must confirm.", {
    title: { type: "string" },
    start_local: { type: "string", description: "yyyy-MM-ddTHH:mm" },
    end_local: { type: "string", description: "yyyy-MM-ddTHH:mm" },
    location: { type: "string" },
    description: { type: "string" },
    kind: { type: "string", enum: ["meeting", "appointment", "personal", "business", "deadline"] },
    business_id: { type: "string" },
  }, ["title", "start_local", "end_local"]),
  fn("create_reminder", "PROPOSE a one-off reminder notification. The user must confirm.", {
    title: { type: "string" },
    at_local: { type: "string", description: "yyyy-MM-ddTHH:mm" },
    body: { type: "string" },
  }, ["title", "at_local"]),
  fn("set_email_follow_up", "PROPOSE a follow-up reminder for an email. The user must confirm.", {
    email_id: { type: "string" },
    at_local: { type: "string", description: "yyyy-MM-ddTHH:mm" },
  }, ["email_id", "at_local"]),
  fn("draft_email_reply", "PROPOSE saving a reply draft for an email (never sends). The user must confirm.", {
    email_id: { type: "string" },
    body: { type: "string" },
  }, ["email_id", "body"]),
  fn("record_transaction", "PROPOSE recording income/expense. ONLY when the user explicitly stated the amount. Never estimate amounts.", {
    type: { type: "string", enum: ["income", "expense"] },
    amount: { type: "number" },
    currency: { type: "string" },
    date: { type: "string", description: "yyyy-MM-dd" },
    description: { type: "string" },
    business_id: { type: "string" },
  }, ["type", "amount", "currency", "date", "description"]),
];

export const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.function.name));

// ---------------------------------------------------------------------------
// Read tool implementations (RLS-scoped client; only the user's own data)
// ---------------------------------------------------------------------------
async function resolveBusiness(ctx: ToolContext, business?: string): Promise<{ mode: "all" | "personal" | "business"; id?: string; name?: string }> {
  if (!business || business === "all") return { mode: "all" };
  if (business === "personal") return { mode: "personal" };
  const { data } = await ctx.supabase.from("businesses").select("id, name").eq("user_id", ctx.userId);
  const b = (data ?? []).find((x) => x.id === business || x.name.toLowerCase() === business.toLowerCase())
    ?? (data ?? []).find((x) => x.name.toLowerCase().includes(business.toLowerCase()));
  return b ? { mode: "business", id: b.id, name: b.name } : { mode: "all" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = { is: (c: string, v: null) => any; eq: (c: string, v: string) => any };
function scopeQuery<Q>(q: Q, s: { mode: string; id?: string }): Q {
  const f = q as unknown as Filterable;
  if (s.mode === "personal") return f.is("business_id", null) as Q;
  if (s.mode === "business" && s.id) return f.eq("business_id", s.id) as Q;
  return q;
}

const taskOut = (t: Task, tz: string) => ({
  id: t.id, title: t.title, priority: t.priority, status: t.status,
  due: t.due_at ? fmt(t.due_at, tz, "EEE d MMM yyyy HH:mm") : null, business_id: t.business_id,
});

export async function runReadTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const { supabase, userId, tz } = ctx;
  const today = todayInTz(tz);
  switch (name) {
    case "get_tasks": {
      const scope = String(args.scope ?? "all_open");
      const lim = Math.min(Number(args.limit ?? 25), 50);
      const s = await resolveBusiness(ctx, args.business as string | undefined);
      let q = supabase.from("tasks").select("*").eq("user_id", userId);
      q = scopeQuery(q, s);
      const dayStart = startOfLocalDay(today, tz).toISOString();
      const dayEnd = endOfLocalDay(today, tz).toISOString();
      if (scope === "completed_recently") q = q.eq("status", "completed").order("completed_at", { ascending: false });
      else {
        q = q.in("status", ["pending", "in_progress"]).order("due_at", { ascending: true, nullsFirst: false });
        if (scope === "today") q = q.gte("due_at", dayStart).lt("due_at", dayEnd);
        if (scope === "overdue") q = q.lt("due_at", dayStart);
        if (scope === "upcoming_7_days") q = q.gte("due_at", dayStart).lt("due_at", endOfLocalDay(addDaysToDateString(today, 7), tz).toISOString());
      }
      const { data } = await q.limit(lim);
      return { scope, business: s.name ?? s.mode, count: data?.length ?? 0, tasks: ((data ?? []) as Task[]).map((t) => taskOut(t, tz)) };
    }
    case "get_schedule": {
      const from = String(args.from_date ?? today);
      const to = String(args.to_date ?? from);
      const occ = await getEventsBetween(supabase, userId, startOfLocalDay(from, tz), endOfLocalDay(to, tz));
      return {
        from, to,
        events: occ.slice(0, 60).map((o) => ({
          id: o.event.id, title: o.event.title, kind: o.event.kind, location: o.event.location, all_day: o.event.all_day,
          start: fmt(o.start, tz, "EEE d MMM HH:mm"), end: fmt(o.end, tz, "HH:mm"), recurring: Boolean(o.event.recurrence_rule),
        })),
      };
    }
    case "get_financial_summary": {
      const period = String(args.period ?? "this_month");
      let from: string, toExcl: string;
      if (period === "last_month") {
        const thisM = monthRange(today);
        const prev = monthRange(addDaysToDateString(thisM.start, -1));
        from = prev.start; toExcl = prev.end;
      } else if (period === "this_quarter") ({ start: from, end: toExcl } = periodRange("quarterly", today));
      else if (period === "this_year") ({ start: from, end: toExcl } = periodRange("annual", today));
      else if (period === "custom" && args.from_date && args.to_date) { from = String(args.from_date); toExcl = addDaysToDateString(String(args.to_date), 1); }
      else ({ start: from, end: toExcl } = monthRange(today));
      const s = await resolveBusiness(ctx, args.business as string | undefined);
      let q = supabase.from("transactions").select("type, amount, currency, category_id, business_id, occurred_on").eq("user_id", userId).gte("occurred_on", from).lt("occurred_on", toExcl);
      q = scopeQuery(q, s);
      const [{ data: txs }, { data: cats }] = await Promise.all([q.limit(5000), supabase.from("categories").select("id, name").eq("user_id", userId)]);
      const rows = (txs ?? []) as Transaction[];
      const sum = summarize(rows);
      const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
      return {
        period: { from, to_inclusive: addDaysToDateString(toExcl, -1) },
        scope: s.name ?? s.mode,
        transactions: sum.count,
        income: fmtTotals(sum.income), expenses: fmtTotals(sum.expense), net: fmtTotals(sum.net),
        top_expense_categories: expensesByCategory(rows).slice(0, 6).map((c) => ({ category: c.categoryId ? catName.get(c.categoryId) ?? "Unknown" : "Uncategorised", amount: formatCents(c.cents, c.currency) })),
        note: "Totals are grouped per currency and never converted.",
      };
    }
    case "get_budget_status": {
      const st = await getBudgetStatuses(supabase, userId, today);
      return st.map((s) => ({
        budget: s.budget.name, period: `${s.budget.period} (${s.periodStart} to ${addDaysToDateString(s.periodEnd, -1)})`,
        spent: formatCents(s.spentCents, s.budget.currency), limit: formatCents(s.limitCents, s.budget.currency),
        remaining: formatCents(s.remainingCents, s.budget.currency), percent_used: Math.round(s.percent), status: s.level,
        projected_period_spend: formatCents(s.projectedCents, s.budget.currency),
      }));
    }
    case "get_bills": {
      const kind = String(args.kind ?? "both");
      const within = Number(args.within_days ?? 7);
      let q = supabase.from("bills").select("*").eq("user_id", userId).eq("status", "open").lte("due_date", addDaysToDateString(today, within)).order("due_date");
      if (kind !== "both") q = q.eq("kind", kind);
      const { data } = await q.limit(50);
      return ((data ?? []) as Bill[]).map((b) => ({
        id: b.id, kind: b.kind, title: b.title, due_date: b.due_date, overdue: b.due_date < today,
        outstanding: formatCents(outstandingCents(b), b.currency), invoice_number: b.invoice_number,
      }));
    }
    case "search_transactions": {
      let q = supabase.from("transactions").select("*").eq("user_id", userId).order("occurred_on", { ascending: false });
      if (args.query) {
        const term = String(args.query).replace(/[%,()]/g, " ").trim();
        q = q.or(`description.ilike.%${term}%,counterparty.ilike.%${term}%`);
      }
      if (args.type && args.type !== "any") q = q.eq("type", String(args.type));
      if (args.from_date) q = q.gte("occurred_on", String(args.from_date));
      if (args.to_date) q = q.lte("occurred_on", String(args.to_date));
      const { data } = await q.limit(Math.min(Number(args.limit ?? 20), 50));
      return ((data ?? []) as Transaction[]).map((t) => ({ date: t.occurred_on, type: t.type, amount: formatCents(Math.round(Number(t.amount) * 100), t.currency), description: t.description, counterparty: t.counterparty }));
    }
    case "search_emails": {
      let q = supabase.from("email_messages").select("id, subject, from_name, from_email, received_at, snippet, ai_summary, is_unread, is_important, awaiting_reply, follow_up_at").eq("user_id", userId).order("received_at", { ascending: false });
      if (args.query) {
        const term = String(args.query).replace(/[%,()]/g, " ").trim();
        q = q.or(`subject.ilike.%${term}%,from_email.ilike.%${term}%,from_name.ilike.%${term}%,snippet.ilike.%${term}%`);
      }
      const f = String(args.filter ?? "any");
      if (f === "important_unread") q = q.eq("is_important", true).eq("is_unread", true);
      if (f === "awaiting_reply") q = q.eq("awaiting_reply", true);
      if (f === "follow_up") q = q.not("follow_up_at", "is", null);
      const { data } = await q.limit(Math.min(Number(args.limit ?? 10), 25));
      return ((data ?? []) as EmailMessage[]).map((e) => ({
        id: e.id, subject: e.subject, from: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email,
        received: fmt(e.received_at, tz, "EEE d MMM HH:mm"), summary: e.ai_summary ?? e.snippet?.slice(0, 280),
        unread: e.is_unread, important: e.is_important, awaiting_reply: e.awaiting_reply,
        follow_up: e.follow_up_at ? fmt(e.follow_up_at, tz, "EEE d MMM HH:mm") : null,
      }));
    }
    case "get_email": {
      const { data: e } = await supabase.from("email_messages").select("*").eq("user_id", userId).eq("id", String(args.email_id)).maybeSingle();
      if (!e) return { error: "Email not found" };
      const { data: ins } = await supabase.from("email_insights").select("kind, title, details, status").eq("message_id", e.id);
      return {
        id: e.id, subject: e.subject, from: e.from_email, received: fmt(e.received_at, tz, "EEE d MMM yyyy HH:mm"),
        summary: e.ai_summary, snippet: e.snippet, body_excerpt: e.body_text?.slice(0, 3000) ?? null, suggestions: ins ?? [],
      };
    }
    case "get_deadlines": {
      const days = Math.min(Number(args.days ?? 14), 120);
      const until = addDaysToDateString(today, days);
      const [tasks, bills, projects, events] = await Promise.all([
        supabase.from("tasks").select("*").eq("user_id", userId).in("status", ["pending", "in_progress"]).not("due_at", "is", null).lt("due_at", endOfLocalDay(until, tz).toISOString()).order("due_at").limit(40),
        supabase.from("bills").select("*").eq("user_id", userId).eq("status", "open").lte("due_date", until).order("due_date").limit(30),
        supabase.from("projects").select("id, name, due_date, status").eq("user_id", userId).in("status", ["planning", "active", "on_hold"]).not("due_date", "is", null).lte("due_date", until),
        getEventsBetween(supabase, userId, startOfLocalDay(today, tz), endOfLocalDay(until, tz)),
      ]);
      return {
        tasks: ((tasks.data ?? []) as Task[]).map((t) => ({ ...taskOut(t, tz), overdue: new Date(t.due_at!) < new Date() })),
        bills: ((bills.data ?? []) as Bill[]).map((b) => ({ title: b.title, kind: b.kind, due_date: b.due_date, amount: formatCents(outstandingCents(b), b.currency) })),
        projects: projects.data ?? [],
        deadline_events: events.filter((o) => o.event.kind === "deadline").map((o) => ({ title: o.event.title, date: fmt(o.start, tz, "EEE d MMM") })),
      };
    }
    case "list_businesses": {
      const { data } = await supabase.from("businesses").select("id, name, industry, currency, archived").eq("user_id", userId).order("name");
      return (data ?? []) as Business[];
    }
    case "get_business_report": {
      const s = await resolveBusiness(ctx, args.business as string | undefined);
      const period = String(args.period ?? "last_7_days");
      let from: string, toExcl: string;
      if (period === "this_month") ({ start: from, end: toExcl } = monthRange(today));
      else if (period === "last_month") { const p = monthRange(addDaysToDateString(monthRange(today).start, -1)); from = p.start; toExcl = p.end; }
      else { from = addDaysToDateString(today, -6); toExcl = addDaysToDateString(today, 1); }
      let tq = supabase.from("transactions").select("type, amount, currency, category_id, business_id, occurred_on").eq("user_id", userId).gte("occurred_on", from).lt("occurred_on", toExcl);
      let rq = supabase.from("bills").select("*").eq("user_id", userId).eq("status", "open").eq("kind", "receivable");
      let kq = supabase.from("tasks").select("status, completed_at, due_at").eq("user_id", userId);
      tq = scopeQuery(tq, s.mode === "all" ? { mode: "all" } : s);
      rq = scopeQuery(rq, s);
      kq = scopeQuery(kq, s);
      const [{ data: txs }, { data: recv }, { data: tks }, { data: cats }] = await Promise.all([tq, rq, kq, supabase.from("categories").select("id, name").eq("user_id", userId)]);
      const sum = summarize((txs ?? []) as Transaction[]);
      const fromTs = startOfLocalDay(from, tz).getTime();
      const tasksArr = (tks ?? []) as Pick<Task, "status" | "completed_at" | "due_at">[];
      const completed = tasksArr.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at).getTime() >= fromTs).length;
      const open = tasksArr.filter((t) => t.status === "pending" || t.status === "in_progress");
      const recvTotals: CurrencyTotals = {};
      for (const b of (recv ?? []) as Bill[]) recvTotals[b.currency] = (recvTotals[b.currency] ?? 0) + outstandingCents(b);
      const catName = new Map((cats ?? []).map((c: Pick<Category, "id" | "name">) => [c.id, c.name]));
      return {
        scope: s.name ?? s.mode, period: { from, to_inclusive: addDaysToDateString(toExcl, -1) },
        income: fmtTotals(sum.income), expenses: fmtTotals(sum.expense), net: fmtTotals(sum.net),
        top_expenses: expensesByCategory((txs ?? []) as Transaction[]).slice(0, 5).map((c) => ({ category: c.categoryId ? catName.get(c.categoryId) : "Uncategorised", amount: formatCents(c.cents, c.currency) })),
        outstanding_receivables: fmtTotals(recvTotals),
        tasks_completed_in_period: completed,
        open_tasks: open.length,
        overdue_tasks: open.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length,
      };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Write tools: validated, turned into human-readable proposals
// ---------------------------------------------------------------------------
const localDT = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const writeArgSchemas: Record<string, z.ZodTypeAny> = {
  create_task: z.object({
    title: z.string().min(1).max(300), description: z.string().max(5000).optional(), due_local: localDT.optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(), business_id: z.uuid().optional(), source_email_id: z.uuid().optional(),
  }),
  create_event: z.object({
    title: z.string().min(1).max(300), start_local: localDT, end_local: localDT, location: z.string().max(300).optional(),
    description: z.string().max(5000).optional(), kind: z.enum(["meeting", "appointment", "personal", "business", "deadline"]).optional(), business_id: z.uuid().optional(),
  }),
  create_reminder: z.object({ title: z.string().min(1).max(200), at_local: localDT, body: z.string().max(1000).optional() }),
  set_email_follow_up: z.object({ email_id: z.uuid(), at_local: localDT }),
  draft_email_reply: z.object({ email_id: z.uuid(), body: z.string().min(1).max(20000) }),
  record_transaction: z.object({
    type: z.enum(["income", "expense"]), amount: z.number().positive().max(1e12), currency: z.string().regex(/^[A-Za-z]{3}$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().min(1).max(300), business_id: z.uuid().optional(),
  }),
};

const pretty = (local: string) => local.replace("T", " at ");

export function summarizeProposal(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case "create_task": return `Create task “${a.title}”${a.due_local ? ` due ${pretty(String(a.due_local))}` : ""}${a.priority ? ` (${a.priority})` : ""}`;
    case "create_event": return `Schedule “${a.title}” on ${pretty(String(a.start_local))} – ${String(a.end_local).slice(11)}${a.location ? ` at ${a.location}` : ""}`;
    case "create_reminder": return `Remind you: “${a.title}” on ${pretty(String(a.at_local))}`;
    case "set_email_follow_up": return `Set a follow-up reminder for this email on ${pretty(String(a.at_local))}`;
    case "draft_email_reply": return `Save a reply draft (not sent): “${String(a.body).slice(0, 80)}${String(a.body).length > 80 ? "…" : ""}”`;
    case "record_transaction": return `Record ${a.type} of ${String(a.currency).toUpperCase()} ${Number(a.amount).toFixed(2)} on ${a.date}: “${a.description}”`;
    default: return name;
  }
}
