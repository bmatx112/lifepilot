"use client";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Circle, CircleCheck, Repeat } from "lucide-react";
import { setTaskStatus } from "@/app/actions/tasks";
import { Badge, priorityTone } from "@/components/ui/badge";
import { useLookups } from "@/components/layout/lookups";
import { fmt, todayInTz } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

export function TaskCheck({ task }: { task: Task }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(task.status === "completed");
  return (
    <button
      aria-label={done ? "Mark as not completed" : "Mark as completed"}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        start(async () => {
          setDone(!done);
          const r = await setTaskStatus(task.id, done ? "pending" : "completed");
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
      className={cn("shrink-0 text-muted-foreground hover:text-accent", done && "text-success")}
    >
      {done ? <CircleCheck className="size-5" /> : <Circle className="size-5" />}
    </button>
  );
}

export function DueLabel({ dueAt, className }: { dueAt: string | null; className?: string }) {
  const { timezone } = useLookups();
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const today = todayInTz(timezone);
  const dueDay = todayInTz(timezone, due);
  const late = due < new Date();
  const label = dueDay === today ? `Today ${fmt(due, timezone, "HH:mm")}` : fmt(due, timezone, dueDay.slice(0, 4) === today.slice(0, 4) ? "EEE d MMM, HH:mm" : "d MMM yyyy");
  return <span className={cn("text-xs tabular", late ? "font-medium text-destructive" : "text-muted-foreground", className)}>{late ? "Overdue · " : ""}{label}</span>;
}

export function TaskRow({ task, onOpen, showScope = true }: { task: Task; onOpen?: (t: Task) => void; showScope?: boolean }) {
  const { businesses } = useLookups();
  const biz = task.business_id ? businesses.find((b) => b.id === task.business_id) : null;
  return (
    <div className="group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
      <div className="pt-0.5"><TaskCheck task={task} /></div>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen?.(task)}>
        <p className={cn("truncate text-sm", task.status === "completed" && "text-muted-foreground line-through")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <DueLabel dueAt={task.status === "completed" ? null : task.due_at} />
          {task.priority === "urgent" || task.priority === "high" ? <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge> : null}
          {showScope && biz ? <Badge tone="outline" style={{ borderColor: biz.color }}>{biz.name}</Badge> : null}
          {task.recurrence_rule ? <Repeat className="size-3 text-muted-foreground" aria-label="Repeats" /> : null}
          {task.source === "email" ? <Badge tone="info">from email</Badge> : task.source === "ai" ? <Badge tone="accent">via assistant</Badge> : null}
          {task.is_demo ? <Badge tone="warning">Demo</Badge> : null}
        </div>
      </button>
    </div>
  );
}
