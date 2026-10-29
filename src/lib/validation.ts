import { z } from "zod";

/** Converts FormData into a plain object; repeated keys become arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      if (Array.isArray(out[key])) (out[key] as string[]).push(v);
      else out[key] = [v];
    } else out[k] = v;
  }
  return out;
}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optText = (max = 2000) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional()).transform((v) => v ?? null);
export const reqText = (max = 300, label = "This field") =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);
export const optUuid = z.preprocess(
  (v) => (v === "" || v === "personal" || v === "none" ? undefined : v),
  z.uuid().optional(),
).transform((v) => v ?? null);
export const money = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[, ]/g, "") : v),
  z.coerce.number({ error: "Enter a valid amount" }).positive("Amount must be greater than zero").max(999_999_999_999, "Amount is too large").multipleOf(0.01, "Use at most 2 decimal places"),
);
export const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");
export const dateStr = z.string({ error: "Date is required" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const optDate = z.preprocess(emptyToUndefined, dateStr.optional()).transform((v) => v ?? null);
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time");
export const optLocalDateTime = z.preprocess(emptyToUndefined, localDateTime.optional()).transform((v) => v ?? null);
export const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const priority = z.enum(["low", "medium", "high", "urgent"]);
export const intList = z
  .preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []), z.array(z.coerce.number().int().min(0).max(60 * 24 * 30)))
  .transform((a) => Array.from(new Set(a)).sort((x, y) => y - x));

export const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: money,
  currency,
  occurred_on: dateStr,
  description: reqText(300, "Description"),
  category_id: optUuid,
  business_id: optUuid,
  payment_method: optText(60),
  counterparty: optText(160),
  notes: optText(2000),
});

export const recurringSchema = transactionSchema
  .omit({ occurred_on: true, counterparty: true, notes: true })
  .extend({
    frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
    next_run_on: dateStr,
    end_on: optDate,
  });

export const budgetSchema = z.object({
  name: reqText(120, "Name"),
  amount: money,
  currency,
  period: z.enum(["monthly", "quarterly", "annual"]),
  category_id: optUuid,
  business_id: optUuid,
  alert_thresholds: z
    .preprocess((v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v), z.array(z.coerce.number().int().min(1).max(200)).min(1).max(5))
    .default([80, 100]),
});

export const billSchema = z.object({
  kind: z.enum(["payable", "receivable"]),
  title: reqText(200, "Title"),
  amount: money,
  currency,
  due_date: dateStr,
  invoice_number: optText(60),
  business_id: optUuid,
  contact_id: optUuid,
  category_id: optUuid,
  recurrence: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]).default("none"),
  reminder_days_before: z.coerce.number().int().min(0).max(60).default(3),
  notes: optText(2000),
});

export const categorySchema = z.object({
  name: reqText(60, "Name"),
  kind: z.enum(["income", "expense"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  business_id: optUuid,
});

export const taskSchema = z.object({
  title: reqText(300, "Title"),
  description: optText(5000),
  due_at: optLocalDateTime,
  priority: priority.default("medium"),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
  category: optText(60),
  business_id: optUuid,
  project_id: optUuid,
  parent_task_id: optUuid,
  assignee_contact_id: optUuid,
  repeat: z.enum(["none", "daily", "weekdays", "weekly", "monthly", "yearly"]).default("none"),
  reminder_offsets: intList.default([]),
});

export const eventSchema = z
  .object({
    title: reqText(300, "Title"),
    description: optText(5000),
    location: optText(300),
    kind: z.enum(["meeting", "appointment", "personal", "business", "deadline"]).default("personal"),
    all_day: bool.default(false),
    start: z.string().min(10, "Start is required"),
    end: z.string().min(10, "End is required"),
    business_id: optUuid,
    project_id: optUuid,
    repeat: z.enum(["none", "daily", "weekdays", "weekly", "monthly", "yearly"]).default("none"),
    repeat_until: optDate,
    reminder_offsets: intList.default([]),
    sync_account_id: optUuid,
    status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
  });

export const businessSchema = z.object({
  name: reqText(120, "Name"),
  description: optText(1000),
  industry: optText(80),
  currency,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
});

export const projectSchema = z.object({
  name: reqText(160, "Name"),
  description: optText(2000),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("active"),
  priority: priority.default("medium"),
  start_date: optDate,
  due_date: optDate,
  business_id: optUuid,
});

export const contactSchema = z.object({
  name: reqText(160, "Name"),
  email: z.preprocess(emptyToUndefined, z.email("Enter a valid email").optional()).transform((v) => v ?? null),
  phone: optText(40),
  company: optText(160),
  role: optText(80),
  notes: optText(2000),
  business_id: optUuid,
});

export const profileSchema = z.object({
  full_name: reqText(120, "Name"),
  timezone: z.string().min(1).max(64),
  default_currency: currency,
});

export const reminderSchema = z.object({
  title: reqText(200, "Title"),
  body: optText(1000),
  fire_at: localDateTime,
  repeat: z.enum(["none", "daily", "weekdays", "weekly", "monthly", "yearly"]).default("none"),
});

export function fieldErrors(err: z.ZodError) {
  return z.flattenError(err).fieldErrors as Record<string, string[] | undefined>;
}

export function firstError(err: z.ZodError) {
  const fe = fieldErrors(err);
  const k = Object.keys(fe)[0];
  return k ? `${k.replace(/_/g, " ")}: ${fe[k]?.[0]}` : (err.issues[0]?.message ?? "Invalid input");
}
