"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { businessSchema, contactSchema, fieldErrors, formToObject, projectSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

function done(message: string, data?: unknown): ActionResult<unknown> {
  revalidatePath("/", "layout");
  return { ok: true, message, data };
}

async function upsert(table: string, schema: typeof businessSchema | typeof projectSchema | typeof contactSchema, fd: FormData, label: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const raw = formToObject(fd);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row: Record<string, unknown> = { ...parsed.data, user_id: user.id };
  const res = id
    ? await supabase.from(table).update(row).eq("id", id).eq("user_id", user.id).select("id").single()
    : await supabase.from(table).insert(row).select("id").single();
  if (res.error) return { ok: false, error: res.error.code === "23503" ? "Linked business is invalid." : res.error.message };
  return done(id ? `${label} updated` : `${label} created`, { id: res.data.id });
}

export async function saveBusiness(_p: unknown, fd: FormData) {
  return upsert("businesses", businessSchema, fd, "Business");
}
export async function saveProject(_p: unknown, fd: FormData) {
  return upsert("projects", projectSchema, fd, "Project");
}
export async function saveContact(_p: unknown, fd: FormData) {
  return upsert("contacts", contactSchema, fd, "Contact");
}

export async function archiveBusiness(id: string, archived: boolean): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("businesses").update({ archived }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done(archived ? "Business archived" : "Business restored");
}

/** Permanently deletes a business AND all of its records (cascade). */
export async function deleteBusiness(id: string, confirmName: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { data: b } = await supabase.from("businesses").select("name").eq("id", id).eq("user_id", user.id).single();
  if (!b) return { ok: false, error: "Not found" };
  if (b.name.trim() !== confirmName.trim()) return { ok: false, error: "The name you typed does not match." };
  const { error } = await supabase.from("businesses").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await supabase.rpc("log_audit", { p_action: "business_deleted", p_entity_type: "businesses", p_entity_id: id, p_metadata: { name: b.name } });
  return done("Business and its records deleted");
}

export async function deleteProject(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Project deleted (its tasks were kept)");
}

export async function deleteContact(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("contacts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return done("Contact deleted");
}
