"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/types";

const creds = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

async function origin() {
  const h = await headers();
  return env.appUrl() || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function signIn(_p: unknown, fd: FormData): Promise<ActionResult> {
  const parsed = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message };
  redirect(safeNext(fd.get("next")));
}

export async function signUp(_p: unknown, fd: FormData): Promise<ActionResult> {
  const parsed = creds.extend({ full_name: z.string().trim().min(1, "Enter your name").max(120) }).safeParse({
    email: fd.get("email"), password: fd.get("password"), full_name: fd.get("full_name"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const tz = String(fd.get("timezone") ?? "UTC").slice(0, 64);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name, timezone: tz }, emailRedirectTo: `${await origin()}/auth/confirm?next=/dashboard` },
  });
  if (error) return { ok: false, error: error.message };
  if (data.session) redirect("/dashboard?welcome=1");
  return { ok: true, message: "Check your inbox to confirm your email address, then sign in." };
}

export async function requestPasswordReset(_p: unknown, fd: FormData): Promise<ActionResult> {
  const email = z.email().safeParse(fd.get("email"));
  if (!email.success) return { ok: false, error: "Enter a valid email address" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  // Same response whether or not the account exists (no account enumeration).
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_p: unknown, fd: FormData): Promise<ActionResult> {
  const pw = z.string().min(8, "Password must be at least 8 characters").max(72).safeParse(fd.get("password"));
  if (!pw.success) return { ok: false, error: pw.error.issues[0].message };
  if (fd.get("password") !== fd.get("confirm")) return { ok: false, error: "Passwords do not match" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { ok: false, error: error.message };
  await supabase.rpc("log_audit", { p_action: "password_changed" });
  return { ok: true, message: "Password updated" };
}
