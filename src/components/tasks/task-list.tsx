"use client";
import { useState } from "react";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskDetailDialog } from "@/components/tasks/task-detail";
import type { Task } from "@/lib/types";

/** A list of tasks that opens the detail dialog on click. */
export function TaskList({ tasks, showScope = true, empty }: { tasks: Task[]; showScope?: boolean; empty?: React.ReactNode }) {
  const [open, setOpen] = useState<Task | null>(null);
  if (!tasks.length) return <>{empty ?? null}</>;
  return (
    <>
      <div className="-mx-2 divide-y divide-border/60">
        {tasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} showScope={showScope} />)}
      </div>
      {open ? <TaskDetailDialog task={open} onOpenChange={(o) => !o && setOpen(null)} /> : null}
    </>
  );
}
