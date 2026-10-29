import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysToDateString, endOfLocalDay, startOfLocalDay, todayInTz } from "@/lib/dates";
import { budgetStatus, monthRange, periodRange, summarize, type BudgetStatus } from "@/lib/finance";
import { expandEvents } from "@/lib/recurrence";
import type { Bill, Budget, Business, CalendarEvent, EmailMessage, EventOccurrence, Task, Transaction } from "@/lib/types";

export async function getEventsBetween(supabase: SupabaseClient, userId: string, from: Date, to: Date): Promise<EventOccurrence[]> {
  const { data } = await supabase.from("calendar_events").select("*").eq("user_id", userId).neq("status", "cancelled")
    .or(`recurrence_rule.not.is.null,and(starts_at.lt."${to.toISOString()}",ends_at.gt."${from.toISOString()}")`);
  return expandEvents((data ?? []) as CalendarEvent[], from, to);
}

export async function getBudgetStatuses(supabase: SupabaseClient, userId: string, today: string): Promise<BudgetStatus[]> {
  const { data: budgets } = await supabase.from("budgets").select("*").eq("user_id", userId).eq("active", true).order("name");
  if (!budgets?.length) return [];
  const earliest = (budgets as Budget[]).map((b) => periodRange(b.period, today).start).sort()[0];
  const { data: txs } = await supabase.from("transactions").select("type, amount, currency, category_id, business_id, occurred_on")
    .eq("user_id", userId).eq("type", "expense").gte("occurred_on", earliest);
  return (budgets as Budget[]).map((b) => budgetStatus(b, (txs ?? []) as Transaction[], today)).sort((a, b) => b.percent - a.percent);
}

/** Everything the dashboard, the daily briefing and the assistant need about "today". */
export async function getOverview(supabase: SupabaseClient, userId: string, tz: string, now = new Date()) {
  const today = todayInTz(tz, now);
  const dayStart = startOfLocalDay(today, tz);
  const dayEnd = endOfLocalDay(today, tz);
  const weekAhead = addDaysToDateString(today, 7);
  const { start: mStart, end: mEnd } = monthRange(today);

  const [events, openTasks, monthTx, bills, emails, budgets, businesses, notifications, recentAudit] = await Promise.all([
    getEventsBetween(supabase, userId, dayStart, dayEnd),
    supabase.from("tasks").select("*").eq("user_id", userId).in("status", ["pending", "in_progress"]).is("parent_task_id", null)
      .order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("transactions").select("type, amount, currency, business_id, category_id, occurred_on").eq("user_id", userId)
      .gte("occurred_on", mStart).lt("occurred_on", mEnd),
    supabase.from("bills").select("*").eq("user_id", userId).eq("status", "open").lte("due_date", addDaysToDateString(today, 30)).order("due_date"),
    supabase.from("email_messages").select("*").eq("user_id", userId).or("is_important.eq.true,awaiting_reply.eq.true,follow_up_at.not.is.null")
      .order("received_at", { ascending: false }).limit(30),
    getBudgetStatuses(supabase, userId, today),
    supabase.from("businesses").select("*").eq("user_id", userId).eq("archived", false).order("name"),
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("audit_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
  ]);

  const tasks = (openTasks.data ?? []) as Task[];
  const dueToday = tasks.filter((t) => t.due_at && new Date(t.due_at) >= dayStart && new Date(t.due_at) < dayEnd);
  // Overdue = due before today; tasks due earlier today stay in "due today" (flagged as late in the UI).
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at) < dayStart);
  const upcoming = tasks.filter((t) => t.due_at && new Date(t.due_at) >= dayEnd && new Date(t.due_at) < endOfLocalDay(weekAhead, tz));
  const billRows = (bills.data ?? []) as Bill[];
  const emailRows = (emails.data ?? []) as EmailMessage[];
  const txRows = (monthTx.data ?? []) as Transaction[];

  return {
    today,
    now,
    events,
    tasks: { dueToday, overdue, upcoming, openCount: tasks.length, all: tasks },
    month: { start: mStart, end: mEnd, summary: summarize(txRows), personal: summarize(txRows.filter((t) => !t.business_id)) },
    bills: {
      overdue: billRows.filter((b) => b.due_date < today),
      dueSoon: billRows.filter((b) => b.due_date >= today && b.due_date <= weekAhead),
      later: billRows.filter((b) => b.due_date > weekAhead),
    },
    emails: {
      importantUnread: emailRows.filter((e) => e.is_important && e.is_unread),
      awaitingReply: emailRows.filter((e) => e.awaiting_reply),
      followUps: emailRows.filter((e) => e.follow_up_at).sort((a, b) => a.follow_up_at!.localeCompare(b.follow_up_at!)),
    },
    budgets,
    businesses: (businesses.data ?? []) as Business[],
    notifications: notifications.data ?? [],
    recentActivity: recentAudit.data ?? [],
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
