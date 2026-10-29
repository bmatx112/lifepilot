export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type TxType = "income" | "expense";
export type BudgetPeriod = "monthly" | "quarterly" | "annual";

export interface Profile {
  id: string;
  full_name: string | null;
  timezone: string;
  default_currency: string;
  onboarded: boolean;
}

export interface Business {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  currency: string;
  color: string;
  archived: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  business_id: string | null;
  name: string;
  description: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  is_demo: boolean;
}

export interface Contact {
  id: string;
  business_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
}

export interface Category {
  id: string;
  business_id: string | null;
  name: string;
  kind: TxType;
  color: string;
  is_default: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  business_id: string | null;
  category_id: string | null;
  recurring_id: string | null;
  type: TxType;
  amount: number | string;
  currency: string;
  occurred_on: string;
  description: string;
  payment_method: string | null;
  counterparty: string | null;
  notes: string | null;
  source: string;
  is_demo: boolean;
  created_at: string;
}

export interface RecurringTransaction {
  id: string;
  business_id: string | null;
  category_id: string | null;
  type: TxType;
  amount: number | string;
  currency: string;
  description: string;
  payment_method: string | null;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  next_run_on: string;
  end_on: string | null;
  active: boolean;
}

export interface Budget {
  id: string;
  business_id: string | null;
  category_id: string | null;
  name: string;
  amount: number | string;
  currency: string;
  period: BudgetPeriod;
  alert_thresholds: number[];
  active: boolean;
}

export interface Bill {
  id: string;
  business_id: string | null;
  contact_id: string | null;
  category_id: string | null;
  kind: "payable" | "receivable";
  title: string;
  invoice_number: string | null;
  amount: number | string;
  amount_paid: number | string;
  currency: string;
  due_date: string;
  status: "open" | "paid" | "cancelled";
  paid_on: string | null;
  recurrence: "none" | "weekly" | "monthly" | "quarterly" | "yearly";
  reminder_days_before: number;
  transaction_id: string | null;
  notes: string | null;
  source: string;
  is_demo: boolean;
}

export interface Task {
  id: string;
  user_id: string;
  business_id: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  assignee_contact_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: Priority;
  status: TaskStatus;
  category: string | null;
  recurrence_rule: string | null;
  reminder_offsets: number[];
  completed_at: string | null;
  position: number;
  source: string;
  source_ref: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  business_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  kind: "meeting" | "appointment" | "personal" | "business" | "deadline";
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_exdates: string[];
  status: "confirmed" | "tentative" | "cancelled";
  reminder_offsets: number[];
  provider: "local" | "google" | "microsoft";
  email_account_id: string | null;
  external_id: string | null;
  sync_state: "local" | "synced" | "pending_push" | "error";
  sync_error: string | null;
  source: string;
  is_demo: boolean;
}

/** A concrete occurrence of a (possibly recurring) event. */
export interface EventOccurrence {
  event: CalendarEvent;
  start: Date;
  end: Date;
  /** ISO start of this occurrence; stable key for recurring instances. */
  key: string;
}

export interface EmailAccount {
  id: string;
  provider: "google" | "microsoft";
  email_address: string;
  display_name: string | null;
  scopes: string[];
  status: "connected" | "error" | "revoked";
  mail_sync_enabled: boolean;
  calendar_sync_enabled: boolean;
  last_mail_sync_at: string | null;
  last_calendar_sync_at: string | null;
  last_error: string | null;
}

export interface EmailMessage {
  id: string;
  account_id: string | null;
  business_id: string | null;
  provider_message_id: string | null;
  thread_id: string | null;
  from_name: string | null;
  from_email: string | null;
  to_emails: string[];
  subject: string;
  snippet: string | null;
  body_text: string | null;
  received_at: string;
  is_unread: boolean;
  is_important: boolean;
  awaiting_reply: boolean;
  follow_up_at: string | null;
  ai_summary: string | null;
  ai_analyzed_at: string | null;
  source: "sync" | "manual" | "demo";
  is_demo: boolean;
}

export type InsightKind = "task" | "event" | "payable" | "receivable" | "deadline" | "follow_up" | "reply_needed";

export interface EmailInsight {
  id: string;
  message_id: string;
  kind: InsightKind;
  title: string;
  details: Record<string, unknown>;
  confidence: number | null;
  status: "suggested" | "accepted" | "dismissed";
  created_record_type: string | null;
  created_record_id: string | null;
  created_at: string;
}

export interface EmailDraft {
  id: string;
  message_id: string | null;
  account_id: string | null;
  to_emails: string[];
  subject: string;
  body: string;
  status: "draft" | "saved_to_provider" | "sent" | "failed";
  last_error: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  channels: string[];
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  daily_briefing_enabled: boolean;
  daily_briefing_time: string;
  weekly_summary_enabled: boolean;
  weekly_summary_day: number;
  weekly_summary_time: string;
  task_reminders_enabled: boolean;
  event_reminders_enabled: boolean;
  bill_reminders_enabled: boolean;
  budget_alerts_enabled: boolean;
  follow_up_reminders_enabled: boolean;
  default_task_reminder_minutes: number[];
  default_event_reminder_minutes: number[];
}

export interface ScheduledReminder {
  id: string;
  user_id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  fire_at: string;
  recurrence_rule: string | null;
  status: string;
  attempts: number;
  dedupe_key: string;
}

export interface AiActionLog {
  id: string;
  conversation_id: string | null;
  tool_name: string;
  summary: string;
  arguments: Record<string, unknown>;
  status: "proposed" | "executed" | "rejected" | "failed" | "expired";
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string | null;
  business_id: string | null;
  title: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

/** Standard result returned by server actions to forms. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T; warnings?: string[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
