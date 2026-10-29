"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { advanceDate } from "@/lib/finance";
import { materializeRecurring } from "@/lib/recurring";
import { replanEntity } from "@/lib/reminders/planner";
import { todayInTz } from "@/lib/dates";
import {
  billSchema, budgetSchema, categorySchema, fieldErrors, formToObject, recurringSchema, transactionSchema,
} from "@/lib/validation";
import type { ActionResult, Bill } from "@/lib/types";
import { z } from "zod";

const idSchema = z.uuid();

function done(message: string, warnings?: string[]): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message, warnings };
}

function dbError(e: { message: string; code?: string } | null): ActionResult {
  if (e?.code === "23505") return { ok: false, error: "A record with these details already exists." };
  if (e?.code === "23503") return { ok: false, error: "A linked record (business, category or contact) is invalid." };
  return { ok: false, error: e?.message ?? "Database error" };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export async function saveTransaction(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const raw = formToObject(fd);
  const parsed = transactionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row = { ...parsed.data, user_id: user.id };
  const { error } = id
    ? await supabase.from("transactions").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("transactions").insert(row);
  if (error) return dbError(error);
  const warnings = parsed.data.type === "expense" ? await checkBudgetAlerts(supabase, user.id, profile.timezone, parsed.data.currency) : [];
  return done(id ? "Transaction updated" : `${parsed.data.type === "income" ? "Income" : "Expense"} recorded`, warnings);
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid id" };
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done("Transaction deleted");
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export async function saveBudget(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const raw = formToObject(fd);
  const parsed = budgetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row = { ...parsed.data, user_id: user.id };
  const { error } = id
    ? await supabase.from("budgets").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("budgets").insert(row);
  if (error) return dbError(error);
  const warnings = await checkBudgetAlerts(supabase, user.id, profile.timezone, parsed.data.currency);
  return done(id ? "Budget updated" : "Budget created", warnings);
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done("Budget deleted");
}

export async function toggleBudget(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("budgets").update({ active }).eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done(active ? "Budget activated" : "Budget paused");
}

// ---------------------------------------------------------------------------
// Bills & receivables
// ---------------------------------------------------------------------------
export async function saveBill(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = formToObject(fd);
  const parsed = billSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row = { ...parsed.data, user_id: user.id };
  const res = id
    ? await supabase.from("bills").update(row).eq("id", id).eq("user_id", user.id).select("id").single()
    : await supabase.from("bills").insert(row).select("id").single();
  if (res.error) return dbError(res.error);
  await replanEntity(supabase, user.id, "bill", res.data.id);
  const label = parsed.data.kind === "payable" ? "Bill" : "Receivable";
  return done(id ? `${label} updated` : `${label} added`);
}

export async function deleteBill(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("bills").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("entity_id", id).eq("status", "pending");
  return done("Deleted");
}

/**
 * Marks a bill paid (or a receivable received). Optionally records the matching
 * transaction so the cash flow reflects it. Recurring bills roll forward.
 */
export async function markBillPaid(id: string, recordTransaction: boolean): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const { data: bill } = await supabase.from("bills").select("*").eq("id", id).eq("user_id", user.id).single<Bill & { user_id: string; is_demo: boolean }>();
  if (!bill) return { ok: false, error: "Not found" };
  if (bill.status !== "open") return { ok: false, error: "This item is already closed." };
  const today = todayInTz(profile.timezone);
  let transactionId: string | null = null;
  if (recordTransaction) {
    const remaining = Number(bill.amount) - Number(bill.amount_paid);
    const { data: tx, error } = await supabase.from("transactions").insert({
      user_id: user.id,
      business_id: bill.business_id,
      category_id: bill.category_id,
      type: bill.kind === "payable" ? "expense" : "income",
      amount: remaining.toFixed(2),
      currency: bill.currency,
      occurred_on: today,
      description: bill.kind === "payable" ? `Paid: ${bill.title}` : `Received: ${bill.title}`,
      source: "bill",
      is_demo: bill.is_demo,
    }).select("id").single();
    if (error) return dbError(error);
    transactionId = tx.id;
  }
  const { error } = await supabase.from("bills").update({
    status: "paid", paid_on: today, amount_paid: bill.amount, transaction_id: transactionId,
  }).eq("id", id);
  if (error) return dbError(error);
  await supabase.from("scheduled_reminders").delete().eq("user_id", user.id).eq("entity_id", id).eq("status", "pending");

  if (bill.recurrence !== "none") {
    const { data: next } = await supabase.from("bills").insert({
      user_id: user.id, business_id: bill.business_id, contact_id: bill.contact_id, category_id: bill.category_id,
      kind: bill.kind, title: bill.title, amount: bill.amount, currency: bill.currency,
      due_date: advanceDate(bill.due_date, bill.recurrence), recurrence: bill.recurrence,
      reminder_days_before: bill.reminder_days_before, notes: bill.notes, source: "recurring", is_demo: bill.is_demo,
    }).select("id").single();
    if (next) await replanEntity(supabase, user.id, "bill", next.id);
  }
  const warnings = recordTransaction && bill.kind === "payable" ? await checkBudgetAlerts(supabase, user.id, profile.timezone, bill.currency) : [];
  return done(bill.kind === "payable" ? "Marked as paid" : "Marked as received", warnings);
}

export async function recordPartialPayment(id: string, amount: number): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: bill } = await supabase.from("bills").select("amount, amount_paid, status").eq("id", id).eq("user_id", user.id).single();
  if (!bill || bill.status !== "open") return { ok: false, error: "Not found or closed" };
  if (!(amount > 0)) return { ok: false, error: "Enter a positive amount" };
  const paid = Number(bill.amount_paid) + amount;
  if (paid > Number(bill.amount) + 0.001) return { ok: false, error: "Payment exceeds the outstanding amount" };
  const { error } = await supabase.from("bills").update({ amount_paid: paid.toFixed(2) }).eq("id", id);
  if (error) return dbError(error);
  return done("Payment recorded");
}

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------
export async function saveRecurring(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = formToObject(fd);
  const parsed = recurringSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row = { ...parsed.data, user_id: user.id };
  const { error } = id
    ? await supabase.from("recurring_transactions").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("recurring_transactions").insert(row);
  if (error) return dbError(error);
  return done(id ? "Recurring entry updated" : "Recurring entry created");
}

export async function toggleRecurring(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("recurring_transactions").update({ active }).eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done(active ? "Resumed" : "Paused");
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done("Recurring entry deleted (past transactions are kept)");
}

export async function runRecurringNow(): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const n = await materializeRecurring(supabase, todayInTz(profile.timezone), user.id);
  const warnings = n ? await checkBudgetAlerts(supabase, user.id, profile.timezone) : [];
  return done(n ? `${n} transaction(s) recorded` : "Nothing due yet", warnings);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function saveCategory(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = formToObject(fd);
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const row = { ...parsed.data, user_id: user.id };
  const { error } = id
    ? await supabase.from("categories").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("categories").insert(row);
  if (error) return dbError(error);
  return done(id ? "Category updated" : "Category created");
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", user.id);
  if (error) return dbError(error);
  return done("Category deleted — its transactions are now uncategorised");
}
