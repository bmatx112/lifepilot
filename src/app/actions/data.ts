"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { clearDemoData, seedDemoData } from "@/lib/demo";
import { planForUser } from "@/lib/reminders/planner";
import type { ActionResult } from "@/lib/types";

export async function loadDemoData(): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_demo", true);
  if ((count ?? 0) > 0) return { ok: false, error: "Demo data is already loaded." };
  try {
    await seedDemoData(supabase, user.id, profile.timezone, profile.default_currency);
    await planForUser(supabase, user.id).catch(() => undefined);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data loaded — every sample record is labelled “Demo”." };
}

export async function removeDemoData(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await clearDemoData(supabase, user.id);
    await planForUser(supabase, user.id).catch(() => undefined);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data removed" };
}
