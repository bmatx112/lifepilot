"use client";
import { useState } from "react";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionButton, SubmitButton, useFormAction } from "@/components/ui/form";
import { EmptyState, Progress } from "@/components/ui/misc";
import { ScopeSelect } from "@/components/ui/fields";
import { useLookups } from "@/components/layout/lookups";
import { deleteProject, saveProject } from "@/app/actions/business";
import type { Project, Task } from "@/lib/types";

const STATUS_TONE = { planning: "neutral", active: "info", on_hold: "warning", completed: "success", cancelled: "neutral" } as const;

export function ProjectDialog({ project, businessId, onOpenChange }: { project?: Project | null; businessId?: string | null; onOpenChange: (o: boolean) => void }) {
  const { formAction, fieldErrors, pending } = useFormAction(saveProject, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={project ? "Edit project" : "New project"}>
        <form onSubmit={formAction} className="grid gap-3">
          {project ? <input type="hidden" name="id" value={project.id} /> : null}
          <Field label="Name" htmlFor="p-name" error={fieldErrors.name}><Input id="p-name" name="name" defaultValue={project?.name} required autoFocus /></Field>
          <Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" name="description" rows={2} defaultValue={project?.description ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Status" htmlFor="p-status"><Select id="p-status" name="status" defaultValue={project?.status ?? "active"}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
            <Field label="Priority" htmlFor="p-pri"><Select id="p-pri" name="priority" defaultValue={project?.priority ?? "medium"}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></Select></Field>
            <Field label="Start date" htmlFor="p-start"><Input id="p-start" type="date" name="start_date" defaultValue={project?.start_date ?? ""} /></Field>
            <Field label="Deadline" htmlFor="p-due"><Input id="p-due" type="date" name="due_date" defaultValue={project?.due_date ?? ""} /></Field>
          </div>
          {businessId === undefined ? <Field label="Belongs to" htmlFor="p-scope"><ScopeSelect id="p-scope" defaultValue={project?.business_id ?? "personal"} /></Field> : <input type="hidden" name="business_id" value={businessId ?? ""} />}
          <div className="flex justify-end"><SubmitButton pending={pending} variant="accent">Save project</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPanel({ projects, tasks, businessId }: { projects: Project[]; tasks: Task[]; businessId?: string | null }) {
  const { businesses } = useLookups();
  const [edit, setEdit] = useState<Project | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setEdit("new")}><Plus /> New project</Button></div>
      {projects.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pt = tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
            const done = pt.filter((t) => t.status === "completed").length;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.business_id ? businesses.find((b) => b.id === p.business_id)?.name : "Personal"}{p.due_date ? ` · due ${p.due_date}` : ""}</p>
                  </div>
                  <div className="flex gap-1"><Badge tone={STATUS_TONE[p.status]}>{p.status.replace("_", " ")}</Badge><Badge tone={priorityTone(p.priority)}>{p.priority}</Badge></div>
                </div>
                {p.description ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{done}/{pt.length} tasks done</span><span>{pt.length ? Math.round((done / pt.length) * 100) : 0}%</span></div>
                  <Progress value={pt.length ? (done / pt.length) * 100 : 0} label={`${p.name} progress`} />
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil /> Edit</Button>
                  <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => deleteProject(p.id)} confirm={{ title: `Delete project “${p.name}”?`, description: "Its tasks are kept, just unlinked." }} confirmLabel="Delete"><Trash2 /></ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : <EmptyState icon={<FolderKanban />} title="No projects yet" description="Group related tasks into projects with a status, priority and deadline." />}
      {edit ? <ProjectDialog project={edit === "new" ? null : edit} businessId={businessId} onOpenChange={(o) => !o && setEdit(null)} /> : null}
    </div>
  );
}
