"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { localInputToUtc } from "@/lib/dates";
import { buildRule, nextOccurrence } from "@/lib/recurrence";
import { replanEntity } from "@/lib/reminders/planner";
import { fieldErrors, formToObject, reminderSchema, taskSchema } from "@/lib/validation";
import type { ActionResult, Task, TaskStatus } from "@/lib/types";

function done(message: string, data?: unknown): ActionResult<unknown> {
  revalidatePath("/", "layout");
  return { ok: true, message, data };
}

export async function saveTask(_prev: unknown, fd: FormData): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const raw = formToObject(fd);
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const d = parsed.data;

  let offsets = d.reminder_offsets;
  if (raw.has_reminders !== "1" && !id) {
    const { data: prefs } = await supabase.from("notification_preferences").select("default_task_reminder_minutes").eq("user_id", user.id).single();
    offsets = prefs?.default_task_reminder_minutes ?? [60];
  }
  const dueAt = d.due_at ? localInputToUtc(d.due_at, profile.timezone).toISOString() : null;
  if (d.repeat !== "none" && !dueAt) return { ok: false, error: "A repeating task needs a due date.", fieldErrors: { due_at: ["Required for repeating tasks"] } };

  const row = {
    user_id: user.id,
    title: d.title,
    description: d.description,
    due_at: dueAt,
    priority: d.priority,
    status: d.status,
    category: d.category,
    business_id: d.business_id,
    project_id: d.project_id,
    parent_task_id: d.parent_task_id,
    assignee_contact_id: d.assignee_contact_id,
    recurrence_rule: buildRule(d.repeat),
    reminder_offsets: offsets,
    completed_at: d.status === "completed" ? new Date().toISOString() : null,
    ...(typeof raw.source === "string" && ["email", "ai"].includes(raw.source) && !id ? { source: raw.source, source_ref: (raw.source_ref as string) || null } : {}),
  };
  const res = id
    ? await supabase.from("tasks").update(row).eq("id", id).eq("user_id", user.id).select("id").single()
    : await supabase.from("tasks").insert(row).select("id").single();
  if (res.error) return { ok: false, error: res.error.code === "23503" ? "The selected project, business or contact is invalid." : res.error.message };
  await replanEntity(supabase, user.id, "task", res.data.id);
  return done(id ? "Task updated" : "Task created", { id: res.data.id });
}

/** Creates the next instance of a recurring task after completion. */
async function spawnNextRecurrence(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], task: Task) {
  if (!task.recurrence_rule || !task.due_at) return null;
  const due = new Date(task.due_at);
  const next = nextOccurrence(task.recurrence_rule, due, due);
  if (!next) return null;
  const { data } = await supabase.from("tasks").insert({
    user_id: task.user_id, title: task.title, description: task.description, due_at: next.toISOString(),
    priority: task.priority, status: "pending", category: task.category, business_id: task.business_id,
    project_id: task.project_id, assignee_contact_id: task.assignee_contact_id, recurrence_rule: task.recurrence_rule,
    reminder_offsets: task.reminder_offsets, source: "recurring", source_ref: task.id, is_demo: task.is_demo,
  }).select("id").single();
  // Only the newest instance carries the rule forward.
  await supabase.from("tasks").update({ recurrence_rule: null }).eq("id", task.id);
  return data?.id ?? null;
}

export async function setTaskStatus(id: string, status: TaskStatus, position?: number): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).eq("user_id", user.id).single<Task>();
  if (!task) return { ok: false, error: "Task not found" };
  const patch: Record<string, unknown> = { status, completed_at: status === "completed" ? new Date().toISOString() : null };
  if (position !== undefined) patch.position = position;
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  let msg = status === "completed" ? "Task completed" : "Task updated";
  if (status === "completed" && task.status !== "completed") {
    const nextId = await spawnNextRecurrence(supabase, task);
    if (nextId) {
      msg = "Task completed — next occurrence scheduled";
      await replanEntity(supabase, user.id, "task", nextId);
    }
  }
  await replanEntity(supabase, user.id, "task", id);
  return done(msg);
}

export async function deleteTask(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("entity_id", id).eq("status", "pending");
  return done("Task deleted");
}

export async function quickAddTask(title: string, dueLocal?: string | null): Promise<ActionResult<unknown>> {
  const fd = new FormData();
  fd.set("title", title);
  if (dueLocal) fd.set("due_at", dueLocal);
  return saveTask(null, fd);
}

// Checklist items -------------------------------------------------------------
export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const t = title.trim();
  if (!t || t.length > 300) return { ok: false, error: "Enter an item (max 300 characters)" };
  const { count } = await supabase.from("task_checklist_items").select("id", { count: "exact", head: true }).eq("task_id", taskId);
  const { error } = await supabase.from("task_checklist_items").insert({ user_id: user.id, task_id: taskId, title: t, position: count ?? 0 });
  if (error) return { ok: false, error: error.message };
  return done("Item added");
}

export async function toggleChecklistItem(id: string, done_: boolean): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("task_checklist_items").update({ done: done_ }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteChecklistItem(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("task_checklist_items").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Item removed");
}

// Custom reminders -------------------------------------------------------------
export async function saveReminder(_prev: unknown, fd: FormData): Promise<ActionResult<unknown>> {
  const { supabase, user, profile } = await requireUser();
  const parsed = reminderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const fire = localInputToUtc(parsed.data.fire_at, profile.timezone);
  if (fire.getTime() < Date.now() - 60_000) return { ok: false, error: "Choose a time in the future.", fieldErrors: { fire_at: ["Must be in the future"] } };
  const { error } = await supabase.from("scheduled_reminders").insert({
    user_id: user.id,
    kind: "custom",
    title: parsed.data.title,
    body: parsed.data.body,
    url: "/notifications",
    fire_at: fire.toISOString(),
    recurrence_rule: buildRule(parsed.data.repeat),
    dedupe_key: `custom:${crypto.randomUUID()}`,
  });
  if (error) return { ok: false, error: error.message };
  return done("Reminder scheduled");
}

export async function cancelReminder(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("scheduled_reminders").update({ status: "cancelled" }).eq("id", id).eq("user_id", user.id).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return done("Reminder cancelled");
}
