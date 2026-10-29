"use client";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { ContactSelect, ProjectSelect, REPEAT_OPTIONS, ReminderOffsets, ScopeSelect } from "@/components/ui/fields";
import { saveTask } from "@/app/actions/tasks";
import { useLookups } from "@/components/layout/lookups";
import { utcToLocalInput } from "@/lib/dates";
import { parseSimpleRule } from "@/lib/recurrence";
import type { ActionResult, Task } from "@/lib/types";

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: Task | null;
  defaults?: Omit<Partial<Task>, "source" | "source_ref"> & { due_local?: string; source?: string; source_ref?: string };
  onSaved?: (r: ActionResult<unknown>) => void;
}) {
  const { timezone, defaultTaskReminders } = useLookups();
  const init = { ...defaults, ...task };
  const [scope, setScope] = useState<string>(init.business_id ?? "personal");
  const { formAction, fieldErrors, pending } = useFormAction(saveTask, {
    onSuccess: (r) => {
      onOpenChange(false);
      onSaved?.(r);
    },
  });
  const dueDefault = task?.due_at ? utcToLocalInput(task.due_at, timezone) : defaults?.due_local ?? (defaults?.due_at ? utcToLocalInput(defaults.due_at, timezone) : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task ? "Edit task" : init.parent_task_id ? "New subtask" : "New task"} wide>
        <form onSubmit={formAction} className="grid gap-3">
          {task ? <input type="hidden" name="id" value={task.id} /> : null}
          {init.parent_task_id ? <input type="hidden" name="parent_task_id" value={init.parent_task_id} /> : null}
          {defaults?.source ? <input type="hidden" name="source" value={defaults.source} /> : null}
          {defaults?.source_ref ? <input type="hidden" name="source_ref" value={defaults.source_ref} /> : null}
          <Field label="Title" htmlFor="t-title" error={fieldErrors.title}>
            <Input id="t-title" name="title" defaultValue={init.title} required maxLength={300} autoFocus placeholder="What needs to be done?" />
          </Field>
          <Field label="Description" htmlFor="t-desc">
            <Textarea id="t-desc" name="description" defaultValue={init.description ?? ""} rows={3} maxLength={5000} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Due" htmlFor="t-due" error={fieldErrors.due_at} hint={`Times in ${timezone}`}>
              <Input id="t-due" type="datetime-local" name="due_at" defaultValue={dueDefault} />
            </Field>
            <Field label="Priority" htmlFor="t-pri">
              <Select id="t-pri" name="priority" defaultValue={init.priority ?? "medium"}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="t-status">
              <Select id="t-status" name="status" defaultValue={init.status ?? "pending"}>
                <option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Belongs to" htmlFor="t-scope"><ScopeSelect id="t-scope" defaultValue={scope} onChange={setScope} /></Field>
            <Field label="Project" htmlFor="t-proj"><ProjectSelect key={scope} id="t-proj" businessId={scope} defaultValue={init.project_id} /></Field>
            <Field label="Assigned to" htmlFor="t-assignee"><ContactSelect id="t-assignee" name="assignee_contact_id" businessId={scope} defaultValue={init.assignee_contact_id} placeholder="Me" /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Category / label" htmlFor="t-cat"><Input id="t-cat" name="category" defaultValue={init.category ?? ""} placeholder="e.g. Admin, Sales" maxLength={60} /></Field>
            <Field label="Repeat" htmlFor="t-repeat" hint="The next one is created when you complete this task.">
              <Select id="t-repeat" name="repeat" defaultValue={parseSimpleRule(init.recurrence_rule).freq}>
                {REPEAT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <ReminderOffsets defaultValue={task ? task.reminder_offsets : defaultTaskReminders} />
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent" pendingText="Saving…">{task ? "Save changes" : "Create task"}</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
