"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, FolderKanban, List, ListTodo, Plus, Search, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, priorityTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskDetailDialog } from "@/components/tasks/task-detail";
import { TaskRow, DueLabel } from "@/components/tasks/task-row";
import { ProjectsPanel } from "@/components/business/projects-panel";
import { useLookups } from "@/components/layout/lookups";
import { setTaskStatus } from "@/app/actions/tasks";
import { addDaysToDateString, endOfLocalDay, fmt, startOfLocalDay, todayInTz } from "@/lib/dates";
import { cn, STATUS_LABEL } from "@/lib/utils";
import type { Project, Task, TaskStatus } from "@/lib/types";

type View = "list" | "kanban" | "calendar" | "projects";
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TasksView({ tasks, projects, focusTask }: { tasks: Task[]; projects: Project[]; focusTask: Task | null }) {
  const { timezone, businesses } = useLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const view = (sp.get("view") as View) ?? "list";
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(sp.get("scope") ?? "");
  const [priority, setPriority] = useState("");
  const [project, setProject] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState<Omit<Partial<Task>, "source" | "source_ref"> & { due_local?: string } | null>(null);
  const [open, setOpen] = useState<Task | null>(focusTask);

  const setView = (v: View) => { const p = new URLSearchParams(sp.toString()); p.set("view", v); p.delete("task"); router.push(`${pathname}?${p}`); };

  const filtered = useMemo(() => tasks.filter((t) =>
    (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.description?.toLowerCase().includes(q.toLowerCase())) &&
    (!scope || (scope === "personal" ? !t.business_id : scope === "business" ? !!t.business_id : t.business_id === scope)) &&
    (!priority || t.priority === priority) &&
    (!project || t.project_id === project)), [tasks, q, scope, priority, project]);

  const today = todayInTz(timezone);
  const dayStart = startOfLocalDay(today, timezone);
  const dayEnd = endOfLocalDay(today, timezone);
  const openTasks = filtered.filter((t) => t.status === "pending" || t.status === "in_progress");
  const groups = [
    { key: "overdue", title: "Overdue", tone: "text-destructive", list: openTasks.filter((t) => t.due_at && new Date(t.due_at) < dayStart) },
    { key: "today", title: "Today", list: openTasks.filter((t) => t.due_at && new Date(t.due_at) >= dayStart && new Date(t.due_at) < dayEnd) },
    { key: "week", title: "Next 7 days", list: openTasks.filter((t) => t.due_at && new Date(t.due_at) >= dayEnd && new Date(t.due_at) < endOfLocalDay(addDaysToDateString(today, 7), timezone)) },
    { key: "later", title: "Later", list: openTasks.filter((t) => t.due_at && new Date(t.due_at) >= endOfLocalDay(addDaysToDateString(today, 7), timezone)) },
    { key: "none", title: "No due date", list: openTasks.filter((t) => !t.due_at).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) },
  ];
  const doneTasks = filtered.filter((t) => t.status === "completed" || t.status === "cancelled");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="View">
          {([["list", List, "List"], ["kanban", SquareKanban, "Board"], ["calendar", CalendarDays, "Calendar"], ["projects", FolderKanban, "Projects"]] as const).map(([v, Icon, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm", view === v ? "bg-muted font-medium" : "text-muted-foreground")}>
              <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="accent" onClick={() => setCreating({})}><Plus /> New task</Button>
      </div>

      {view !== "projects" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="pl-8" aria-label="Search tasks" />
          </div>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
            <option value="">Personal & business</option><option value="personal">Personal only</option><option value="business">All businesses</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </Select>
          <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
            <option value="">Any project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      ) : null}

      {view === "list" ? (
        openTasks.length || doneTasks.length ? (
          <div className="space-y-4">
            {groups.filter((g) => g.list.length).map((g) => (
              <section key={g.key} className="rounded-xl border border-border bg-card p-3 shadow-card">
                <h3 className={cn("mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground", g.tone)}>{g.title}<span className="tabular">({g.list.length})</span></h3>
                <div className="divide-y divide-border/60">{g.list.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} />)}</div>
              </section>
            ))}
            {doneTasks.length ? (
              <section className="rounded-xl border border-border bg-card p-3">
                <button className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
                  {showDone ? "Hide" : "Show"} completed & cancelled (last 30 days, {doneTasks.length})
                </button>
                {showDone ? <div className="mt-1 divide-y divide-border/60">{doneTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} />)}</div> : null}
              </section>
            ) : null}
          </div>
        ) : <EmptyState icon={<ListTodo />} title="No tasks yet" description="Create a task, or let the assistant suggest tasks from your email." action={<Button size="sm" variant="accent" onClick={() => setCreating({})}><Plus /> New task</Button>} />
      ) : null}

      {view === "kanban" ? <Kanban tasks={filtered} onOpen={setOpen} /> : null}
      {view === "calendar" ? <TaskCalendar tasks={filtered} onOpen={setOpen} onCreate={(date) => setCreating({ due_local: `${date}T09:00` })} /> : null}
      {view === "projects" ? <ProjectsPanel projects={projects} tasks={tasks} /> : null}

      {creating ? <TaskDialog open defaults={creating} onOpenChange={(o) => !o && setCreating(null)} /> : null}
      {open ? <TaskDetailDialog task={open} onOpenChange={(o) => { if (!o) { setOpen(null); if (sp.get("task")) { const p = new URLSearchParams(sp.toString()); p.delete("task"); router.replace(`${pathname}?${p}`); } } }} /> : null}
    </div>
  );
}

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "pending", title: "To do" },
  { status: "in_progress", title: "In progress" },
  { status: "completed", title: "Done" },
];

function Kanban({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [local, setLocal] = useState<Record<string, TaskStatus>>({});
  const statusOf = (t: Task) => local[t.id] ?? t.status;
  const move = async (t: Task, status: TaskStatus) => {
    if (statusOf(t) === status) return;
    setLocal((l) => ({ ...l, [t.id]: status }));
    const r = await setTaskStatus(t.id, status);
    if (r.ok) toast.success(r.message);
    else { toast.error(r.error); setLocal((l) => { const n = { ...l }; delete n[t.id]; return n; }); }
  };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = tasks.filter((t) => statusOf(t) === col.status);
        return (
          <section key={col.status}
            onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (t) move(t, col.status); }}
            className={cn("min-h-40 rounded-xl border border-border bg-muted/40 p-2 transition", over === col.status && "border-accent bg-accent-soft/40")}
            aria-label={col.title}>
            <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}<span className="tabular">{list.length}</span></h3>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  className="cursor-grab rounded-lg border border-border bg-card p-2.5 shadow-card active:cursor-grabbing">
                  <button className="block w-full text-left" onClick={() => onOpen(t)}>
                    <p className={cn("text-sm font-medium", statusOf(t) === "completed" && "text-muted-foreground line-through")}>{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                      <DueLabel dueAt={statusOf(t) === "completed" ? null : t.due_at} />
                    </div>
                  </button>
                  {/* Keyboard / touch alternative to drag and drop */}
                  <label className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    Move to
                    <select className="rounded border border-border bg-card px-1 py-0.5" value={statusOf(t)} onChange={(e) => move(t, e.target.value as TaskStatus)} aria-label={`Move ${t.title}`}>
                      {(["pending", "in_progress", "completed", "cancelled"] as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskCalendar({ tasks, onOpen, onCreate }: { tasks: Task[]; onOpen: (t: Task) => void; onCreate: (date: string) => void }) {
  const { timezone } = useLookups();
  const today = todayInTz(timezone);
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday-first
  const gridStart = addDaysToDateString(first, -dow);
  const days = Array.from({ length: 42 }, (_, i) => addDaysToDateString(gridStart, i));
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const d = todayInTz(timezone, new Date(t.due_at));
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  const shift = (n: number) => { const [y, m] = month.split("-").map(Number); const idx = y * 12 + m - 1 + n; setMonth(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`); };
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">{fmt(`${first}T12:00:00Z`, "UTC", "MMMM yyyy")}</h3>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
          <Button size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className={cn("min-h-20 bg-card p-1 sm:min-h-24", d.slice(0, 7) !== month && "bg-muted/50 text-muted-foreground")}>
              <button onClick={() => onCreate(d)} className={cn("mb-0.5 flex size-6 items-center justify-center rounded-full text-xs", d === today && "bg-accent text-white")} aria-label={`Add task on ${d}`}>{Number(d.slice(8))}</button>
              <ul className="space-y-0.5">
                {list.slice(0, 3).map((t) => (
                  <li key={t.id}><button onClick={() => onOpen(t)} className={cn("w-full truncate rounded px-1 text-left text-[11px]", t.status === "completed" ? "bg-muted text-muted-foreground line-through" : t.priority === "urgent" || t.priority === "high" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent")}>{t.title}</button></li>
                ))}
                {list.length > 3 ? <li className="px-1 text-[10px] text-muted-foreground">+{list.length - 3} more</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
