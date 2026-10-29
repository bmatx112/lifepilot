import { requireUser } from "@/lib/auth";
import { addDaysToDateString, endOfLocalDay, startOfLocalDay, todayInTz } from "@/lib/dates";
import { getEventsBetween } from "@/lib/data/overview";
import { PageHeader } from "@/components/ui/misc";
import { CalendarView, type CalView, type SerializedOccurrence } from "@/components/calendar/calendar-view";
import type { Bill, Task } from "@/lib/types";

export const metadata = { title: "Calendar" };

function range(view: CalView, date: string): [string, string] {
  if (view === "day") return [date, date];
  if (view === "week") {
    const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = addDaysToDateString(date, -dow);
    return [start, addDaysToDateString(start, 6)];
  }
  if (view === "agenda") return [date, addDaysToDateString(date, 30)];
  const first = `${date.slice(0, 7)}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDaysToDateString(first, -dow);
  return [start, addDaysToDateString(start, 41)];
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const view = (["day", "week", "month", "agenda"].includes(String(sp.view)) ? sp.view : "week") as CalView;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayInTz(tz);
  const [from, to] = range(view, date);
  const fromTs = startOfLocalDay(from, tz);
  const toTs = endOfLocalDay(to, tz);

  const [occ, tasks, bills, accounts] = await Promise.all([
    getEventsBetween(supabase, user.id, fromTs, toTs),
    supabase.from("tasks").select("*").eq("user_id", user.id).in("status", ["pending", "in_progress"]).gte("due_at", fromTs.toISOString()).lt("due_at", toTs.toISOString()),
    supabase.from("bills").select("*").eq("user_id", user.id).eq("status", "open").gte("due_date", from).lte("due_date", to),
    supabase.from("email_accounts").select("provider, email_address, status, last_calendar_sync_at, calendar_sync_enabled").eq("user_id", user.id),
  ]);
  // Cancelled occurrences are hidden by getEventsBetween; include them separately would clutter.
  const occurrences: SerializedOccurrence[] = occ.map((o) => ({ key: o.key, start: o.start.toISOString(), end: o.end.toISOString(), event: o.event }));

  return (
    <>
      <PageHeader title="Calendar" description={`Times shown in ${tz}.`} />
      <CalendarView
        view={view}
        date={date}
        from={from}
        to={to}
        occurrences={occurrences}
        tasks={(tasks.data ?? []) as Task[]}
        bills={(bills.data ?? []) as Bill[]}
        accounts={accounts.data ?? []}
      />
    </>
  );
}
