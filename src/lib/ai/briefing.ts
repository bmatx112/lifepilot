import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOverview, type Overview } from "@/lib/data/overview";
import { chatCompletion } from "@/lib/ai/openai";
import { features } from "@/lib/env";
import { fmt } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { currenciesIn } from "@/lib/finance";
import { runReadTool } from "@/lib/ai/tools";

function compact(o: Overview, tz: string) {
  return {
    date: o.today,
    events: o.events.map((e) => ({ title: e.event.title, start: e.event.all_day ? "all day" : fmt(e.start, tz, "HH:mm"), end: fmt(e.end, tz, "HH:mm"), location: e.event.location })),
    tasks_due_today: o.tasks.dueToday.map((t) => ({ title: t.title, priority: t.priority, due: fmt(t.due_at!, tz, "HH:mm") })),
    overdue_tasks: o.tasks.overdue.slice(0, 10).map((t) => ({ title: t.title, priority: t.priority, due: fmt(t.due_at!, tz, "d MMM") })),
    bills_overdue: o.bills.overdue.map((b) => ({ title: b.title, kind: b.kind, due: b.due_date, amount: `${b.currency} ${b.amount}` })),
    bills_due_7_days: o.bills.dueSoon.map((b) => ({ title: b.title, kind: b.kind, due: b.due_date, amount: `${b.currency} ${b.amount}` })),
    month_to_date: currenciesIn(o.month.summary).map((c) => ({
      currency: c, income: formatCents(o.month.summary.income[c] ?? 0, c), expenses: formatCents(o.month.summary.expense[c] ?? 0, c),
    })),
    budgets_at_risk: o.budgets.filter((b) => b.level !== "ok").map((b) => ({ name: b.budget.name, percent: Math.round(b.percent) })),
    important_unread_emails: o.emails.importantUnread.slice(0, 5).map((e) => ({ subject: e.subject, from: e.from_name ?? e.from_email })),
    awaiting_reply: o.emails.awaitingReply.length,
  };
}

/** Deterministic briefing used when AI is not configured (or fails). */
export function rulesBriefing(o: Overview, tz: string, name: string): string {
  const lines: string[] = [];
  const hour = Number(fmt(new Date(), tz, "H"));
  lines.push(`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${name.split(" ")[0]}. Here's ${fmt(o.now, tz, "EEEE d MMMM")}:`);
  lines.push(o.events.length
    ? `• ${o.events.length} event(s) today, starting with “${o.events[0].event.title}” at ${o.events[0].event.all_day ? "all day" : fmt(o.events[0].start, tz, "HH:mm")}.`
    : "• No calendar events today.");
  lines.push(`• ${o.tasks.dueToday.length} task(s) due today${o.tasks.overdue.length ? `, ${o.tasks.overdue.length} overdue` : ""}.`);
  const urgent = [...o.tasks.overdue, ...o.tasks.dueToday].filter((t) => t.priority === "urgent" || t.priority === "high");
  if (urgent.length) lines.push(`• Priority: ${urgent.slice(0, 3).map((t) => `“${t.title}”`).join(", ")}.`);
  if (o.bills.overdue.length) lines.push(`• ${o.bills.overdue.length} bill/receivable(s) overdue.`);
  if (o.bills.dueSoon.length) lines.push(`• ${o.bills.dueSoon.length} payment(s) due within 7 days.`);
  const atRisk = o.budgets.filter((b) => b.level !== "ok");
  if (atRisk.length) lines.push(`• Budgets needing attention: ${atRisk.map((b) => `${b.budget.name} (${Math.round(b.percent)}%)`).join(", ")}.`);
  if (o.emails.importantUnread.length) lines.push(`• ${o.emails.importantUnread.length} important unread email(s).`);
  if (o.emails.awaitingReply.length) lines.push(`• ${o.emails.awaitingReply.length} email(s) may be awaiting your reply.`);
  return lines.join("\n");
}

export async function generateBriefing(supabase: SupabaseClient, userId: string, tz: string, name: string, opts: { useAi?: boolean } = {}) {
  const o = await getOverview(supabase, userId, tz);
  let content = rulesBriefing(o, tz, name);
  let by: "ai" | "rules" = "rules";
  if ((opts.useAi ?? true) && features.ai()) {
    try {
      const { message } = await chatCompletion({
        messages: [
          { role: "system", content: "Write a concise, friendly daily briefing (max 120 words, plain text, short bullet lines starting with •). Use ONLY the JSON data provided; do not invent anything. Start with a one-line greeting using the user's first name. Highlight what matters most first (overdue, urgent, money due). If a section is empty, skip it." },
          { role: "user", content: JSON.stringify({ name, ...compact(o, tz) }) },
        ],
        maxTokens: 400,
        temperature: 0.3,
      });
      if (message.content?.trim()) {
        content = message.content.trim();
        by = "ai";
      }
    } catch (e) {
      console.error("AI briefing failed, using rules", e);
    }
  }
  await supabase.from("daily_briefings").upsert(
    { user_id: userId, briefing_date: o.today, kind: "daily", content, generated_by: by },
    { onConflict: "user_id,kind,briefing_date" },
  );
  return { content, generated_by: by, date: o.today };
}

export async function generateWeeklySummary(supabase: SupabaseClient, userId: string, tz: string, currency: string) {
  const ctx = { supabase, userId, tz, currency, conversationId: null };
  const [report, deadlines] = await Promise.all([
    runReadTool("get_business_report", { period: "last_7_days", business: "all" }, ctx),
    runReadTool("get_deadlines", { days: 7 }, ctx),
  ]);
  const r = report as Record<string, unknown>;
  const d = deadlines as { tasks: unknown[]; bills: unknown[] };
  let content = [
    `Week in review (${(r.period as { from: string }).from} → ${(r.period as { to_inclusive: string }).to_inclusive}):`,
    `• Income: ${r.income}; Expenses: ${r.expenses}; Net: ${r.net}`,
    `• Tasks completed: ${r.tasks_completed_in_period}; open: ${r.open_tasks}; overdue: ${r.overdue_tasks}`,
    `• Outstanding receivables: ${r.outstanding_receivables}`,
    `• Coming up this week: ${d.tasks.length} task deadline(s), ${d.bills.length} payment(s)`,
  ].join("\n");
  let by: "ai" | "rules" = "rules";
  if (features.ai()) {
    try {
      const { message } = await chatCompletion({
        messages: [
          { role: "system", content: "Write a weekly summary (max 150 words, plain text bullets starting with •) using ONLY this JSON. Do not invent figures. End with 2 concrete suggestions based on the data." },
          { role: "user", content: JSON.stringify({ report, deadlines }) },
        ],
        maxTokens: 450,
      });
      if (message.content?.trim()) { content = message.content.trim(); by = "ai"; }
    } catch (e) {
      console.error(e);
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  await supabase.from("daily_briefings").upsert({ user_id: userId, briefing_date: date, kind: "weekly", content, generated_by: by }, { onConflict: "user_id,kind,briefing_date" });
  return content;
}
