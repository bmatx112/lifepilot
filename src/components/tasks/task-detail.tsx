"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, priorityTone, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/misc";
import { Attachments } from "@/components/ui/attachments";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskCheck, DueLabel } from "@/components/tasks/task-row";
import { useLookups } from "@/components/layout/lookups";
import { addChecklistItem, deleteChecklistItem, deleteTask, setTaskStatus, toggleChecklistItem } from "@/app/actions/tasks";
import { createClient } from "@/lib/supabase/client";
import { describeRule } from "@/lib/recurrence";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/utils";
import type { Attachment, ChecklistItem, Task } from "@/lib/types";

export function TaskDetailDialog({ task, onOpenChange }: { task: Task; onOpenChange: (o: boolean) => void }) {
  const { businesses, projects, contacts } = useLookups();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [newItem, setNewItem] = useState("");
  const [pending, start] = useTransition();

  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all([
      sb.from("task_checklist_items").select("*").eq("task_id", task.id).order("position"),
      sb.from("tasks").select("*").eq("parent_task_id", task.id).order("created_at"),
      sb.from("attachments").select("*").eq("entity_type", "task").eq("entity_id", task.id).order("created_at"),
    ]).then(([c, s, a]) => {
      if (!alive) return;
      setItems((c.data ?? []) as ChecklistItem[]);
      setSubtasks((s.data ?? []) as Task[]);
      setFiles((a.data ?? []) as Attachment[]);
    });
    return () => {
      alive = false;
    };
  }, [task.id, version]);

  const biz = businesses.find((b) => b.id === task.business_id);
  const proj = projects.find((p) => p.id === task.project_id);
  const assignee = contacts.find((c) => c.id === task.assignee_contact_id);
  const doneCount = items.filter((i) => i.done).length;

  if (editing) return <TaskDialog open task={task} onOpenChange={(o) => { if (!o) { setEditing(false); onOpenChange(false); } }} />;
  if (addingSub) return <TaskDialog open defaults={{ parent_task_id: task.id, business_id: task.business_id, project_id: task.project_id }} onOpenChange={(o) => { if (!o) { setAddingSub(false); load(); } }} />;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={task.title} wide>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(task.status)}>{STATUS_LABEL[task.status]}</Badge>
            <Badge tone={priorityTone(task.priority)}>{PRIORITY_LABEL[task.priority]}</Badge>
            <DueLabel dueAt={task.due_at} />
            {biz ? <Badge tone="outline">{biz.name}</Badge> : <Badge tone="outline">Personal</Badge>}
            {proj ? <Badge tone="outline">Project: {proj.name}</Badge> : null}
            {assignee ? <Badge tone="outline">Assigned: {assignee.name}</Badge> : null}
            {task.category ? <Badge>{task.category}</Badge> : null}
            {task.recurrence_rule ? <Badge tone="info">{describeRule(task.recurrence_rule)}</Badge> : null}
            {task.reminder_offsets.length ? <Badge tone="neutral">{task.reminder_offsets.length} reminder(s)</Badge> : null}
          </div>
          {task.description ? <p className="whitespace-pre-wrap text-sm text-foreground/90">{task.description}</p> : null}
          {task.completed_at ? <p className="text-xs text-muted-foreground">Completed {new Date(task.completed_at).toLocaleString()}</p> : null}

          <div>
            <SectionTitle>Checklist {items.length ? `(${doneCount}/${items.length})` : ""}</SectionTitle>
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i.id} className="group flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={i.done} aria-label={i.title}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, done: v } : x)));
                      toggleChecklistItem(i.id, v);
                    }} />
                  <span className={i.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{i.title}</span>
                  <button aria-label="Remove item" className="opacity-60 hover:opacity-100" onClick={() => start(async () => { await deleteChecklistItem(i.id); load(); })}><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const t = newItem;
              if (!t.trim()) return;
              start(async () => {
                const r = await addChecklistItem(task.id, t);
                if (!r.ok) toast.error(r.error);
                else { setNewItem(""); load(); }
              });
            }}>
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add checklist item" className="h-8" aria-label="New checklist item" />
              <Button type="submit" size="sm" variant="outline" disabled={pending}><Plus /></Button>
            </form>
          </div>

          {!task.parent_task_id ? (
            <div>
              <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setAddingSub(true)}><Plus /> Subtask</Button>}>Subtasks</SectionTitle>
              {subtasks.length ? (
                <ul className="space-y-1">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <TaskCheck task={s} />
                      <span className={s.status === "completed" ? "text-muted-foreground line-through" : ""}>{s.title}</span>
                      <DueLabel dueAt={s.status === "completed" ? null : s.due_at} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No subtasks.</p>}
            </div>
          ) : null}

          <div>
            <SectionTitle>Attachments</SectionTitle>
            <Attachments entityType="task" entityId={task.id} businessId={task.business_id} initial={files} />
          </div>

          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
            <ActionButton variant="ghost" size="sm" className="text-destructive" action={() => deleteTask(task.id)} confirm={{ title: "Delete this task?", description: "Subtasks and checklist items are deleted too." }} confirmLabel="Delete" onDone={(r) => r.ok && onOpenChange(false)}>
              <Trash2 /> Delete
            </ActionButton>
            <div className="flex gap-2">
              {task.status !== "in_progress" && task.status !== "completed" ? (
                <ActionButton size="sm" variant="outline" action={() => setTaskStatus(task.id, "in_progress")} onDone={() => { onOpenChange(false); router.refresh(); }}>Start</ActionButton>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
              {task.status !== "completed" ? (
                <ActionButton size="sm" variant="accent" action={() => setTaskStatus(task.id, "completed")} onDone={() => onOpenChange(false)}>Complete</ActionButton>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
