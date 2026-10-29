import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBudgetStatuses, getEventsBetween } from "@/lib/data/overview";
import { addDaysToDateString, endOfLocalDay, fmt, startOfLocalDay, todayInTz } from "@/lib/dates";
import { expensesByCategory, lastMonths, monthlySeries, monthRange, outstandingCents, summarize } from "@/lib/finance";
import { addTo, formatCents, fromCents, type CurrencyTotals } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Progress, Stat } from "@/components/ui/misc";
import { Totals } from "@/components/ui/money";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Attachments } from "@/components/ui/attachments";
import { CategoryBars, CountBars, IncomeExpenseChart } from "@/components/charts/charts";
import { BusinessActions } from "@/components/business/business-header";
import { ProjectsPanel } from "@/components/business/projects-panel";
import { ContactsPanel } from "@/components/business/contacts-panel";
import { TaskList } from "@/components/tasks/task-list";
import { TransactionsTable } from "@/components/finance/transactions-table";
import { BillsView } from "@/components/finance/bills-view";
import type { Attachment, Bill, Business, Category, Contact, Project, Task, Transaction } from "@/lib/types";

const TABS = ["overview", "finance", "invoices", "projects", "tasks", "calendar", "contacts", "documents", "reports"] as const;
type Tab = (typeof TABS)[number];

export default async function BusinessDetail({ params, searchParams }: PageProps<"/business/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const { supabase, user, profile } = await requireUser();
  const tz = profile.timezone;
  const { data: business } = await supabase.from("businesses").select("*").eq("id", id).eq("user_id", user.id).maybeSingle<Business>();
  if (!business) notFound();
  const today = todayInTz(tz);
  const { start: mStart, end: mEnd } = monthRange(today);
  const months = lastMonths(today.slice(0, 7), 12);

  const [txs, tasks, bills, projects, contacts, docs, cats, budgets, events] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id).eq("business_id", id).gte("occurred_on", `${months[0]}-01`).order("occurred_on", { ascending: false }).limit(5000),
    supabase.from("tasks").select("*").eq("user_id", user.id).eq("business_id", id).is("parent_task_id", null).order("due_at", { ascending: true, nullsFirst: false }).limit(1000),
    supabase.from("bills").select("*").eq("user_id", user.id).eq("business_id", id).order("due_date"),
    supabase.from("projects").select("*").eq("user_id", user.id).eq("business_id", id).order("name"),
    supabase.from("contacts").select("*").eq("user_id", user.id).eq("business_id", id).order("name"),
    supabase.from("attachments").select("*").eq("user_id", user.id).eq("business_id", id).eq("entity_type", "business_document").order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    getBudgetStatuses(supabase, user.id, today),
    getEventsBetween(supabase, user.id, startOfLocalDay(today, tz), endOfLocalDay(addDaysToDateString(today, 30), tz)),
  ]);
  const tx = (txs.data ?? []) as Transaction[];
  const allTasks = (tasks.data ?? []) as Task[];
  const openTasks = allTasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const billRows = (bills.data ?? []) as Bill[];
  const openBills = billRows.filter((b) => b.status === "open");
  const month = summarize(tx.filter((t) => t.occurred_on >= mStart && t.occurred_on < mEnd));
  const recv: CurrencyTotals = {};
  const pay: CurrencyTotals = {};
  openBills.forEach((b) => addTo(b.kind === "receivable" ? recv : pay, b.currency, outstandingCents(b)));
  const bizBudgets = budgets.filter((b) => b.budget.business_id === id);
  const bizEvents = events.filter((o) => o.event.business_id === id);
  const catName = new Map(((cats.data ?? []) as Pick<Category, "id" | "name">[]).map((c) => [c.id, c.name]));
  const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at) < new Date());

  const href = (t: Tab) => `/business/${id}?tab=${t}`;
  const labels: Record<Tab, string> = { overview: "Overview", finance: "Finance", invoices: "Invoices & bills", projects: "Projects", tasks: "Tasks", calendar: "Meetings", contacts: "Contacts", documents: "Documents", reports: "Performance" };

  return (
    <div>
      <Link href="/business" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Businesses</Link>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl text-base font-semibold text-white" style={{ background: business.color }}>{business.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{business.name} {business.archived ? <Badge>archived</Badge> : null} {business.is_demo ? <Badge tone="warning">Demo</Badge> : null}</h1>
            <p className="text-sm text-muted-foreground">{[business.industry, business.currency, business.description].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <BusinessActions business={business} />
      </div>
      <LinkTabs active={tab} tabs={TABS.map((t) => ({ key: t, href: href(t), label: labels[t], count: t === "tasks" ? openTasks.length : t === "invoices" ? openBills.length : undefined }))} />

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><CardContent className="pt-4 sm:pt-5"><Stat label="Income this month" value={<Totals totals={month.income} empty={formatCents(0, business.currency)} />} tone="positive" /></CardContent></Card>
            <Card><CardContent className="pt-4 sm:pt-5"><Stat label="Expenses this month" value={<Totals totals={month.expense} empty={formatCents(0, business.currency)} />} /></CardContent></Card>
            <Card><CardContent className="pt-4 sm:pt-5"><Stat label="Owed to you" value={<Totals totals={recv} empty={formatCents(0, business.currency)} />} /></CardContent></Card>
            <Card><CardContent className="pt-4 sm:pt-5"><Stat label="Bills to pay" value={<Totals totals={pay} empty={formatCents(0, business.currency)} />} /></CardContent></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><div><CardTitle>Priority tasks</CardTitle><CardDescription>{openTasks.length} open · {overdue.length} overdue</CardDescription></div><Link href={href("tasks")} className="text-xs text-accent hover:underline">All</Link></CardHeader>
              <CardContent><TaskList showScope={false} tasks={[...overdue, ...openTasks.filter((t) => !overdue.includes(t) && (t.priority === "urgent" || t.priority === "high"))].slice(0, 6)} empty={<EmptyState title="No urgent or overdue tasks" />} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Upcoming meetings</CardTitle><Link href={href("calendar")} className="text-xs text-accent hover:underline">All</Link></CardHeader>
              <CardContent>
                {bizEvents.length ? <ul className="space-y-2">{bizEvents.slice(0, 5).map((o) => <li key={o.key} className="text-sm"><p className="truncate font-medium">{o.event.title}</p><p className="text-xs text-muted-foreground">{fmt(o.start, tz, "EEE d MMM, HH:mm")}{o.event.location ? ` · ${o.event.location}` : ""}</p></li>)}</ul> : <EmptyState title="No meetings in the next 30 days" />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Budget</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {bizBudgets.length ? bizBudgets.map((s) => (
                  <div key={s.budget.id}>
                    <div className="mb-1 flex justify-between text-xs"><span>{s.budget.name}</span><span className="tabular">{formatCents(s.spentCents, s.budget.currency)} / {formatCents(s.limitCents, s.budget.currency)}</span></div>
                    <Progress value={s.percent} tone={s.level === "exceeded" ? "danger" : s.level === "warning" ? "warning" : "accent"} label={`${s.budget.name} usage`} />
                  </div>
                )) : <EmptyState title="No budget for this business" action={<Link href="/finance/budgets" className="text-xs text-accent underline">Create one</Link>} />}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><div><CardTitle>Open invoices & bills</CardTitle></div><Link href={href("invoices")} className="text-xs text-accent hover:underline">Manage</Link></CardHeader>
            <CardContent>
              {openBills.length ? <ul className="divide-y divide-border/60">{openBills.slice(0, 6).map((b) => (
                <li key={b.id} className="flex justify-between gap-2 py-1.5 text-sm"><span className="truncate">{b.title} <Badge tone={b.kind === "receivable" ? "success" : "neutral"}>{b.kind === "receivable" ? "invoice" : "bill"}</Badge></span><span className="shrink-0"><span className={`mr-2 text-xs ${b.due_date < today ? "text-destructive" : "text-muted-foreground"}`}>{b.due_date}</span><span className="font-medium tabular">{formatCents(outstandingCents(b), b.currency)}</span></span></li>
              ))}</ul> : <EmptyState title="Nothing outstanding" />}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "finance" ? <TransactionsTable rows={tx.slice(0, 200)} page={1} pages={1} /> : null}
      {tab === "invoices" ? <BillsView bills={billRows.filter((b) => (sp.status === "closed" ? b.status !== "open" : b.status === "open"))} today={today} status={sp.status === "closed" ? "closed" : "open"} /> : null}
      {tab === "projects" ? <ProjectsPanel projects={(projects.data ?? []) as Project[]} tasks={allTasks} businessId={id} /> : null}
      {tab === "tasks" ? (
        <Card><CardContent className="pt-4"><TaskList showScope={false} tasks={openTasks} empty={<EmptyState title="No open tasks for this business" />} /></CardContent></Card>
      ) : null}
      {tab === "calendar" ? (
        <Card><CardContent className="pt-4">
          {bizEvents.length ? (
            <ul className="divide-y divide-border">{bizEvents.map((o) => (
              <li key={o.key} className="flex items-start gap-3 py-2 text-sm">
                <CalendarDays className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0"><p className="font-medium">{o.event.title}</p><p className="flex items-center gap-1 text-xs text-muted-foreground">{fmt(o.start, tz, "EEE d MMM, HH:mm")}–{fmt(o.end, tz, "HH:mm")}{o.event.location ? <><MapPin className="ml-1 size-3" />{o.event.location}</> : null}</p></div>
              </li>
            ))}</ul>
          ) : <EmptyState title="No meetings in the next 30 days" description="Use Add → Meeting to schedule one." />}
          <p className="mt-2 text-xs text-muted-foreground"><Link href="/calendar" className="underline">Open the full calendar</Link> for day/week/month views.</p>
        </CardContent></Card>
      ) : null}
      {tab === "contacts" ? <ContactsPanel contacts={(contacts.data ?? []) as Contact[]} businessId={id} /> : null}
      {tab === "documents" ? (
        <Card><CardHeader><div><CardTitle>Business documents</CardTitle><CardDescription>Contracts, registrations, tax certificates, quotes — stored privately.</CardDescription></div></CardHeader>
          <CardContent><Attachments entityType="business_document" businessId={id} initial={(docs.data ?? []) as Attachment[]} titlePrompt /></CardContent></Card>
      ) : null}
      {tab === "reports" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader><div><CardTitle>Income vs expenses</CardTitle><CardDescription>Last 12 months · {business.currency}</CardDescription></div><Link href={`/reports?scope=${id}`} className="text-xs text-accent hover:underline">Full report</Link></CardHeader>
            <CardContent><IncomeExpenseChart currency={business.currency} data={monthlySeries(tx, business.currency, months).map((r) => ({ label: new Date(`${r.month}-15`).toLocaleString("en", { month: "short" }), income: fromCents(r.income), expense: fromCents(r.expense) }))} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top expense categories (12 months)</CardTitle></CardHeader>
            <CardContent>{(() => { const rows = expensesByCategory(tx).filter((r) => r.currency === business.currency).slice(0, 8); return rows.length ? <CategoryBars currency={business.currency} data={rows.map((r) => ({ name: r.categoryId ? catName.get(r.categoryId) ?? "Unknown" : "Uncategorised", value: fromCents(r.cents) }))} /> : <EmptyState title="No expenses recorded" />; })()}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Tasks completed per month</CardTitle></CardHeader>
            <CardContent>
              <CountBars series={[{ key: "completed", label: "Completed" }]} data={months.slice(-6).map((m) => ({ label: new Date(`${m}-15`).toLocaleString("en", { month: "short" }), completed: allTasks.filter((t) => t.completed_at?.startsWith(m)).length }))} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
