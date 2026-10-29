-- LifePilot AI — core schema
-- Every user-owned row carries an explicit user_id. Business-scoped rows also
-- carry business_id; a NULL business_id means the record is personal.
-- Composite foreign keys (business_id, user_id) guarantee a row can only be
-- attached to a business owned by the same user.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  timezone text not null default 'UTC',
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Businesses & projects
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  industry text,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  color text not null default '#0f766e',
  archived boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index businesses_user_idx on public.businesses (user_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  email text,
  phone text,
  company text,
  role text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade
);
create index contacts_user_idx on public.contacts (user_id, business_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active'
    check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  start_date date,
  due_date date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade
);
create index projects_user_idx on public.projects (user_id, business_id);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#64748b',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade
);
create unique index categories_unique_name
  on public.categories (user_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name));

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  category_id uuid,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null,
  payment_method text,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_on date not null,
  end_on date,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index recurring_tx_due_idx on public.recurring_transactions (next_run_on) where active;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  category_id uuid,
  recurring_id uuid,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 300),
  payment_method text,
  counterparty text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'recurring', 'bill', 'email', 'import')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (recurring_id, user_id) references public.recurring_transactions (id, user_id) on delete set null (recurring_id)
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_business_idx on public.transactions (user_id, business_id, occurred_on desc);
create index transactions_category_idx on public.transactions (category_id);
-- A recurring template can produce at most one transaction per date.
create unique index transactions_recurring_once on public.transactions (recurring_id, occurred_on) where recurring_id is not null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  period text not null check (period in ('monthly', 'quarterly', 'annual')),
  alert_thresholds integer[] not null default '{80,100}',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);
create index budgets_user_idx on public.budgets (user_id, business_id);

-- Payables (bills) and receivables (invoices owed to the user)
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  contact_id uuid,
  category_id uuid,
  kind text not null check (kind in ('payable', 'receivable')),
  title text not null check (char_length(title) between 1 and 200),
  invoice_number text,
  amount numeric(14, 2) not null check (amount > 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_on date,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  reminder_days_before integer not null default 3 check (reminder_days_before between 0 and 60),
  transaction_id uuid,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'email', 'recurring')),
  source_ref text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (amount_paid <= amount),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete set null (contact_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);
create index bills_user_due_idx on public.bills (user_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  project_id uuid,
  parent_task_id uuid,
  assignee_contact_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  category text,
  recurrence_rule text,
  reminder_offsets integer[] not null default '{}',
  completed_at timestamptz,
  position double precision not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai', 'email', 'recurring')),
  source_ref text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (parent_task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (assignee_contact_id, user_id) references public.contacts (id, user_id) on delete set null (assignee_contact_id)
);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_parent_idx on public.tasks (parent_task_id);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index checklist_task_idx on public.task_checklist_items (task_id, position);

-- ---------------------------------------------------------------------------
-- Integrations (metadata is user-readable; tokens are not)
-- ---------------------------------------------------------------------------
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  email_address text not null,
  display_name text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  mail_sync_enabled boolean not null default true,
  calendar_sync_enabled boolean not null default true,
  last_mail_sync_at timestamptz,
  last_calendar_sync_at timestamptz,
  calendar_sync_token text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider, email_address)
);

-- Encrypted OAuth tokens. RLS is enabled with NO policies and privileges are
-- revoked, so only the service role (server-side) can read or write.
create table public.email_account_tokens (
  account_id uuid primary key references public.email_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  code_verifier text not null,
  redirect_to text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  location text,
  kind text not null default 'personal' check (kind in ('meeting', 'appointment', 'personal', 'business', 'deadline')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'UTC',
  recurrence_rule text,
  recurrence_exdates timestamptz[] not null default '{}',
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
  reminder_offsets integer[] not null default '{15}',
  provider text not null default 'local' check (provider in ('local', 'google', 'microsoft')),
  email_account_id uuid,
  external_id text,
  external_etag text,
  sync_state text not null default 'local' check (sync_state in ('local', 'synced', 'pending_push', 'error')),
  sync_error text,
  last_synced_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'ai', 'email', 'sync')),
  source_ref text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_at >= starts_at),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (email_account_id, user_id) references public.email_accounts (id, user_id) on delete set null (email_account_id)
);
create index events_user_time_idx on public.calendar_events (user_id, starts_at);
create index events_recurring_idx on public.calendar_events (user_id) where recurrence_rule is not null;
-- Prevents duplicate imports of the same provider event.
create unique index events_external_unique on public.calendar_events (user_id, provider, external_id);

-- ---------------------------------------------------------------------------
-- Email (metadata + AI insights)
-- ---------------------------------------------------------------------------
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid,
  business_id uuid,
  provider_message_id text,
  thread_id text,
  from_name text,
  from_email text,
  to_emails text[] not null default '{}',
  subject text not null default '(no subject)',
  snippet text,
  -- Only populated for manually pasted messages; provider bodies are fetched on demand.
  body_text text,
  received_at timestamptz not null default now(),
  is_unread boolean not null default true,
  is_important boolean not null default false,
  awaiting_reply boolean not null default false,
  follow_up_at timestamptz,
  ai_summary text,
  ai_analyzed_at timestamptz,
  source text not null default 'sync' check (source in ('sync', 'manual', 'demo')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.email_accounts (id, user_id) on delete cascade,
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete set null (business_id)
);
-- NULLs are distinct, so manual messages (no provider id) never collide.
create unique index email_messages_provider_unique on public.email_messages (account_id, provider_message_id);
create index email_messages_user_time_idx on public.email_messages (user_id, received_at desc);

create table public.email_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null,
  kind text not null check (kind in ('task', 'event', 'payable', 'receivable', 'deadline', 'follow_up', 'reply_needed')),
  title text not null,
  details jsonb not null default '{}',
  confidence numeric(3, 2),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed')),
  created_record_type text,
  created_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (message_id, user_id) references public.email_messages (id, user_id) on delete cascade
);
create index email_insights_user_idx on public.email_insights (user_id, status);

create table public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid,
  account_id uuid,
  to_emails text[] not null default '{}',
  subject text not null default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'saved_to_provider', 'sent', 'failed')),
  provider_draft_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (message_id, user_id) references public.email_messages (id, user_id) on delete set null (message_id),
  foreign key (account_id, user_id) references public.email_accounts (id, user_id) on delete set null (account_id)
);

-- ---------------------------------------------------------------------------
-- Attachments & business documents (files live in the private storage bucket)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid,
  entity_type text not null check (entity_type in ('transaction', 'task', 'bill', 'event', 'business_document')),
  entity_id uuid,
  title text,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete cascade
);
create index attachments_entity_idx on public.attachments (user_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Notifications & scheduling
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  email_address text,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  daily_briefing_enabled boolean not null default true,
  daily_briefing_time time not null default '07:00',
  weekly_summary_enabled boolean not null default true,
  weekly_summary_day smallint not null default 1 check (weekly_summary_day between 0 and 6),
  weekly_summary_time time not null default '08:00',
  task_reminders_enabled boolean not null default true,
  event_reminders_enabled boolean not null default true,
  bill_reminders_enabled boolean not null default true,
  budget_alerts_enabled boolean not null default true,
  follow_up_reminders_enabled boolean not null default true,
  default_task_reminder_minutes integer[] not null default '{60}',
  default_event_reminder_minutes integer[] not null default '{15}',
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'task_due', 'task_reminder', 'event', 'bill', 'receivable', 'follow_up', 'custom',
    'daily_briefing', 'weekly_summary')),
  entity_type text,
  entity_id uuid,
  title text not null,
  body text,
  url text,
  fire_at timestamptz not null,
  recurrence_rule text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  -- Unique per user; makes planning idempotent and prevents duplicate sends.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index reminders_due_idx on public.scheduled_reminders (fire_at) where status = 'pending';
create index reminders_entity_idx on public.scheduled_reminders (user_id, entity_type, entity_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text,
  entity_type text,
  entity_id uuid,
  reminder_id uuid references public.scheduled_reminders (id) on delete set null,
  channels text[] not null default '{in_app}',
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.daily_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  briefing_date date not null,
  kind text not null default 'daily' check (kind in ('daily', 'weekly')),
  content text not null,
  generated_by text not null check (generated_by in ('ai', 'rules')),
  created_at timestamptz not null default now(),
  unique (user_id, kind, briefing_date)
);

-- ---------------------------------------------------------------------------
-- AI assistant
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  action_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid,
  tool_name text not null,
  summary text not null,
  arguments jsonb not null default '{}',
  status text not null default 'proposed' check (status in ('proposed', 'executed', 'rejected', 'failed', 'expired')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete set null (conversation_id)
);
create index ai_action_logs_user_idx on public.ai_action_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit & rate limiting
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'businesses', 'contacts', 'projects', 'categories', 'recurring_transactions',
    'transactions', 'budgets', 'bills', 'tasks', 'task_checklist_items', 'email_accounts',
    'calendar_events', 'email_messages', 'email_insights', 'email_drafts',
    'notification_preferences', 'scheduled_reminders', 'ai_conversations'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
