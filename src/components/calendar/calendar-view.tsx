"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Plus, Receipt, RefreshCw, Search, SquareCheckBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { EventDialog } from "@/components/calendar/event-dialog";
import { EventDetailDialog } from "@/components/calendar/event-detail";
import { TaskDetailDialog } from "@/components/tasks/task-detail";
import { useLookups } from "@/components/layout/lookups";
import { addDaysToDateString, fmt, todayInTz } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Bill, CalendarEvent, Task } from "@/lib/types";

export type CalView = "day" | "week" | "month" | "agenda";
export interface SerializedOccurrence { key: string; start: string; end: string; event: CalendarEvent }

const KIND_STYLE: Record<CalendarEvent["kind"], string> = {
  meeting: "border-l-[var(--chart-2)] bg-info-soft text-foreground",
  appointment: "border-l-[var(--chart-4)] bg-muted text-foreground",
  personal: "border-l-[var(--chart-1)] bg-accent-soft text-foreground",
  business: "border-l-[var(--chart-5)] bg-muted text-foreground",
  deadline: "border-l-destructive bg-destructive-soft text-foreground",
};

const HOUR_PX = 48;

export function CalendarView({ view, date, from, to, occurrences, tasks, bills, accounts }: {
  view: CalView; date: string; from: string; to: string; occurrences: SerializedOccurrence[]; tasks: Task[]; bills: Bill[];
  accounts: { provider: string; email_address: string; status: string; last_calendar_sync_at: string | null; calendar_sync_enabled: boolean }[];
}) {
  const { timezone, businesses } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [scope, setScope] = useState("");
  const [creating, setCreating] = useState<{ start_local: string; end_local: string } | null>(null);
  const [selected, setSelected] = useState<SerializedOccurrence | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const today = todayInTz(timezone);

  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => p.set(k, v));
    router.push(`${pathname}?${p}`);
  };
  const step = (dir: number) => {
    if (view === "day") return nav({ date: addDaysToDateString(date, dir) });
    if (view === "week") return nav({ date: addDaysToDateString(date, 7 * dir) });
    if (view === "agenda") return nav({ date: addDaysToDateString(date, 30 * dir) });
    const [y, m] = date.split("-").map(Number);
    const idx = y * 12 + m - 1 + dir;
    nav({ date: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01` });
  };

  const occ = useMemo(() => occurrences.filter((o) =>
    (!q || o.event.title.toLowerCase().includes(q.toLowerCase()) || o.event.location?.toLowerCase().includes(q.toLowerCase()) || o.event.description?.toLowerCase().includes(q.toLowerCase())) &&
    (!kind || o.event.kind === kind) &&
    (!scope || (scope === "personal" ? !o.event.business_id : o.event.business_id === scope))), [occurrences, q, kind, scope]);

  const localDay = (iso: string) => todayInTz(timezone, new Date(iso));
  const days = useMemo(() => { const out: string[] = []; for (let d = from; d <= to; d = addDaysToDateString(d, 1)) out.push(d); return out; }, [from, to]);
  const byDay = (d: string) => occ.filter((o) => localDay(o.start) <= d && (localDay(new Date(new Date(o.end).getTime() - 1).toISOString()) >= d));
  const tasksOn = (d: string) => tasks.filter((t) => t.due_at && localDay(t.due_at) === d);
  const billsOn = (d: string) => bills.filter((b) => b.due_date === d);

  const title = view === "month" ? fmt(`${date.slice(0, 7)}-15T12:00:00Z`, "UTC", "MMMM yyyy")
    : view === "day" ? fmt(`${date}T12:00:00Z`, "UTC", "EEEE d MMMM yyyy")
    : `${fmt(`${from}T12:00:00Z`, "UTC", "d MMM")} – ${fmt(`${to}T12:00:00Z`, "UTC", "d MMM yyyy")}`;

  const newAt = (d: string, hour = 9) => setCreating({ start_local: `${d}T${String(hour).padStart(2, "0")}:00`, end_local: `${d}T${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00` });
  const errored = accounts.filter((a) => a.status === "error");

  return (
    <div className="space-y-3">
      {errored.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"><CircleAlert className="size-4" /> Calendar sync problem with {errored.map((a) => a.email_address).join(", ")}. <Link href="/settings/integrations" className="underline">Fix in Integrations</Link></div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button size="sm" variant="outline" onClick={() => nav({ date: today })}>Today</Button>
          <Button size="icon-sm" variant="outline" onClick={() => step(1)} aria-label="Next"><ChevronRight /></Button>
        </div>
        <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Calendar view">
          {(["day", "week", "month", "agenda"] as CalView[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => nav({ view: v })} className={cn("rounded-md px-2.5 py-1 text-sm capitalize", view === v ? "bg-muted font-medium" : "text-muted-foreground")}>{v}</button>
          ))}
        </div>
        <Button size="sm" variant="accent" onClick={() => newAt(view === "day" ? date : today > from && today <= to ? today : from)}><Plus /> Event</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="relative col-span-2">
          <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events in this range" className="pl-8" aria-label="Search events" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">All types</option><option value="meeting">Meetings</option><option value="appointment">Appointments</option><option value="personal">Personal</option><option value="business">Business</option><option value="deadline">Deadlines</option></Select>
        <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope"><option value="">Personal & business</option><option value="personal">Personal</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      </div>

      {view === "month" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((d) => {
              const evs = byDay(d);
              const items = [...evs.map((o) => ({ k: o.key, node: (
                <button onClick={() => setSelected(o)} className={cn("w-full truncate rounded border-l-2 px-1 text-left text-[11px]", KIND_STYLE[o.event.kind])}>
                  {o.event.all_day ? "" : <span className="tabular text-muted-foreground">{fmt(o.start, timezone, "HH:mm")} </span>}{o.event.title}
                </button>) })),
                ...tasksOn(d).map((t) => ({ k: t.id, node: <button onClick={() => setTask(t)} className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] text-muted-foreground hover:bg-muted"><SquareCheckBig className="size-3 shrink-0" />{t.title}</button> })),
                ...billsOn(d).map((b) => ({ k: b.id, node: <Link href="/finance/bills" className="flex items-center gap-1 truncate rounded px-1 text-[11px] text-warning hover:bg-muted"><Receipt className="size-3 shrink-0" />{b.title}</Link> }))];
              return (
                <div key={d} className={cn("min-h-24 bg-card p-1 sm:min-h-28", d.slice(0, 7) !== date.slice(0, 7) && "bg-muted/40")}>
                  <button onClick={() => nav({ view: "day", date: d })} className={cn("mb-0.5 flex size-6 items-center justify-center rounded-full text-xs", d === today ? "bg-accent text-white" : "hover:bg-muted", d.slice(0, 7) !== date.slice(0, 7) && "text-muted-foreground")} aria-label={`Open ${d}`}>{Number(d.slice(8))}</button>
                  <ul className="space-y-0.5">{items.slice(0, 4).map((i) => <li key={i.k}>{i.node}</li>)}{items.length > 4 ? <li><button onClick={() => nav({ view: "day", date: d })} className="px-1 text-[10px] text-muted-foreground hover:underline">+{items.length - 4} more</button></li> : null}</ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" || view === "day" ? (
        <TimeGrid days={view === "day" ? [date] : days} occ={occ} tasksOn={tasksOn} billsOn={billsOn} today={today} onSelect={setSelected} onTask={setTask} onCreate={newAt} />
      ) : null}

      {view === "agenda" ? (
        <div className="space-y-3">
          {days.filter((d) => byDay(d).length || tasksOn(d).length || billsOn(d).length).map((d) => (
            <section key={d} className="rounded-xl border border-border bg-card p-3 shadow-card">
              <h3 className={cn("mb-2 text-sm font-semibold", d === today && "text-accent")}>{fmt(`${d}T12:00:00Z`, "UTC", "EEEE d MMMM")}{d === today ? " · Today" : ""}</h3>
              <ul className="space-y-1.5">
                {byDay(d).map((o) => (
                  <li key={o.key}><button onClick={() => setSelected(o)} className="flex w-full items-start gap-3 rounded-md p-1 text-left hover:bg-muted">
                    <span className="w-24 shrink-0 text-xs tabular text-muted-foreground">{o.event.all_day ? "All day" : `${fmt(o.start, timezone, "HH:mm")}–${fmt(o.end, timezone, "HH:mm")}`}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{o.event.title}</span>{o.event.location ? <span className="block truncate text-xs text-muted-foreground">{o.event.location}</span> : null}</span>
                    <Badge className="ml-auto" tone="outline">{o.event.kind}</Badge>
                  </button></li>
                ))}
                {tasksOn(d).map((t) => <li key={t.id}><button onClick={() => setTask(t)} className="flex w-full items-center gap-3 rounded-md p-1 text-left text-sm hover:bg-muted"><span className="w-24 text-xs tabular text-muted-foreground">{fmt(t.due_at!, timezone, "HH:mm")}</span><SquareCheckBig className="size-3.5 text-muted-foreground" /> {t.title}</button></li>)}
                {billsOn(d).map((b) => <li key={b.id} className="flex items-center gap-3 p-1 text-sm"><span className="w-24 text-xs text-muted-foreground">Due</span><Receipt className="size-3.5 text-warning" /> {b.title}</li>)}
              </ul>
            </section>
          ))}
          {!days.some((d) => byDay(d).length || tasksOn(d).length || billsOn(d).length) ? <EmptyState icon={<CalendarDays />} title="Nothing scheduled in the next 30 days" /> : null}
        </div>
      ) : null}

      {accounts.length ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><RefreshCw className="size-3" /> Synced with {accounts.filter((a) => a.calendar_sync_enabled).map((a) => `${a.provider === "google" ? "Google" : "Outlook"} (${a.email_address}${a.last_calendar_sync_at ? `, ${fmt(a.last_calendar_sync_at, timezone, "d MMM HH:mm")}` : ""})`).join(", ") || "no calendars (sync disabled)"}</p>
      ) : <p className="text-xs text-muted-foreground">Connect Google Calendar or Outlook in <Link href="/settings/integrations" className="underline">Settings → Integrations</Link> for two-way sync.</p>}

      {creating ? <EventDialog open defaults={creating} onOpenChange={(o) => !o && setCreating(null)} /> : null}
      {selected ? <EventDetailDialog occurrence={selected} onOpenChange={(o) => !o && setSelected(null)} /> : null}
      {task ? <TaskDetailDialog task={task} onOpenChange={(o) => !o && setTask(null)} /> : null}
    </div>
  );
}

function layoutLanes(items: { key: string; s: number; e: number }[]) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const lanes: number[] = [];
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: string[] = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((k) => out.get(k)!.lane + 1)); cluster.forEach((k) => (out.get(k)!.lanes = n)); cluster = []; lanes.length = 0; };
  for (const it of sorted) {
    if (it.s >= clusterEnd && cluster.length) flush();
    let lane = lanes.findIndex((end) => end <= it.s);
    if (lane === -1) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e;
    out.set(it.key, { lane, lanes: 1 });
    cluster.push(it.key);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

function TimeGrid({ days, occ, tasksOn, billsOn, today, onSelect, onTask, onCreate }: {
  days: string[]; occ: SerializedOccurrence[]; tasksOn: (d: string) => Task[]; billsOn: (d: string) => Bill[]; today: string;
  onSelect: (o: SerializedOccurrence) => void; onTask: (t: Task) => void; onCreate: (d: string, h: number) => void;
}) {
  const { timezone } = useLookups();
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * HOUR_PX });
    const tick = () => { const [h, m] = fmt(new Date(), timezone, "HH:mm").split(":").map(Number); setNowMin(h * 60 + m); };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [timezone]);
  const minutes = (iso: string) => { const [h, m] = fmt(iso, timezone, "HH:mm").split(":").map(Number); return h * 60 + m; };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className={cn("border-l border-border px-1 py-1.5 text-center", d === today && "text-accent")}>
            <p className="text-[11px] text-muted-foreground">{fmt(`${d}T12:00:00Z`, "UTC", "EEE")}</p>
            <p className="text-sm font-semibold">{Number(d.slice(8))}</p>
          </div>
        ))}
        <div className="text-[10px] text-muted-foreground">all-day</div>
        {days.map((d) => {
          const allDay = occ.filter((o) => o.event.all_day && todayInTz(timezone, new Date(o.start)) <= d && todayInTz(timezone, new Date(new Date(o.end).getTime() - 1)) >= d);
          return (
            <div key={d} className="min-h-6 space-y-0.5 border-l border-t border-border p-0.5">
              {allDay.map((o) => <button key={o.key} onClick={() => onSelect(o)} className={cn("block w-full truncate rounded border-l-2 px-1 text-left text-[11px]", KIND_STYLE[o.event.kind])}>{o.event.title}</button>)}
              {tasksOn(d).map((t) => <button key={t.id} onClick={() => onTask(t)} className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] text-muted-foreground hover:bg-muted"><SquareCheckBig className="size-3 shrink-0" />{t.title}</button>)}
              {billsOn(d).map((b) => <Link key={b.id} href="/finance/bills" className="flex items-center gap-1 truncate px-1 text-[11px] text-warning"><Receipt className="size-3 shrink-0" />{b.title}</Link>)}
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="relative max-h-[65dvh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0,1fr))`, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] tabular text-muted-foreground" style={{ top: h * HOUR_PX }}>{h ? `${String(h).padStart(2, "0")}:00` : ""}</span>)}
          </div>
          {days.map((d) => {
            const timed = occ.filter((o) => !o.event.all_day && todayInTz(timezone, new Date(o.start)) <= d && todayInTz(timezone, new Date(new Date(o.end).getTime() - 1)) >= d);
            const placed = timed.map((o) => {
              const sDay = todayInTz(timezone, new Date(o.start));
              const eDay = todayInTz(timezone, new Date(new Date(o.end).getTime() - 1));
              const s = sDay < d ? 0 : minutes(o.start);
              const e = eDay > d ? 1440 : Math.max(s + 20, minutes(o.end) || 1440);
              return { o, s, e };
            });
            const lanes = layoutLanes(placed.map((p) => ({ key: p.o.key, s: p.s, e: p.e })));
            return (
              <div key={d} className="relative border-l border-border">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} onClick={() => onCreate(d, h)} className="absolute inset-x-0 border-t border-border/60 hover:bg-accent-soft/30" style={{ top: h * HOUR_PX, height: HOUR_PX }} aria-label={`New event ${d} ${h}:00`} />
                ))}
                {d === today && nowMin !== null ? <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive" style={{ top: (nowMin / 60) * HOUR_PX }} /> : null}
                {placed.map(({ o, s, e }) => {
                  const l = lanes.get(o.key)!;
                  return (
                    <button key={o.key} onClick={() => onSelect(o)}
                      className={cn("absolute z-[5] overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ring-2 ring-card", KIND_STYLE[o.event.kind], o.event.status === "tentative" && "opacity-70")}
                      style={{ top: (s / 60) * HOUR_PX, height: Math.max(18, ((e - s) / 60) * HOUR_PX - 2), left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }}>
                      {e - s <= 40 ? (
                        <span className="block truncate"><span className="font-medium">{o.event.title}</span> <span className="text-muted-foreground tabular">{fmt(o.start, timezone, "HH:mm")}</span></span>
                      ) : (
                        <>
                          <span className="block truncate font-medium">{o.event.title}</span>
                          <span className="block truncate text-muted-foreground tabular">{fmt(o.start, timezone, "HH:mm")}–{fmt(o.end, timezone, "HH:mm")}{o.event.location ? ` · ${o.event.location}` : ""}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
