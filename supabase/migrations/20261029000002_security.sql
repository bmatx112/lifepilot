-- LifePilot AI — Row Level Security, auth hooks, audit triggers and server-side RPCs

-- ---------------------------------------------------------------------------
-- Row Level Security: owners only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'businesses', 'contacts', 'projects', 'categories', 'recurring_transactions',
    'transactions', 'budgets', 'bills', 'tasks', 'task_checklist_items', 'email_accounts',
    'calendar_events', 'email_messages', 'email_insights', 'email_drafts', 'attachments',
    'push_subscriptions', 'scheduled_reminders', 'notifications', 'daily_briefings',
    'ai_conversations', 'ai_messages', 'ai_action_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy owner_all on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy owner_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.notification_preferences enable row level security;
create policy owner_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy owner_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Audit logs: users may read their own trail, never modify it.
alter table public.audit_logs enable row level security;
create policy owner_select on public.audit_logs for select to authenticated using (user_id = (select auth.uid()));

-- Server-only tables: RLS on, no policies, privileges revoked.
alter table public.email_account_tokens enable row level security;
alter table public.oauth_states enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.email_account_tokens from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- AI action logs are an audit record: the client can read them but only the
-- server (which validates and executes actions) may change their status.
drop policy owner_all on public.ai_action_logs;
create policy owner_select on public.ai_action_logs for select to authenticated using (user_id = (select auth.uid()));
create policy owner_insert on public.ai_action_logs for insert to authenticated with check (user_id = (select auth.uid()) and status in ('proposed', 'executed'));
create policy owner_update on public.ai_action_logs for update to authenticated
  using (user_id = (select auth.uid()) and status = 'proposed')
  with check (user_id = (select auth.uid()));

-- Integration metadata: readable by owner; written by the server (service role)
-- after a successful OAuth exchange. The owner may toggle sync flags or delete.
drop policy owner_all on public.email_accounts;
create policy owner_select on public.email_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy owner_update on public.email_accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy owner_delete on public.email_accounts for delete to authenticated using (user_id = (select auth.uid()));
-- Only these columns may be changed from the browser.
revoke update on public.email_accounts from authenticated;
grant update (mail_sync_enabled, calendar_sync_enabled) on public.email_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  );

  insert into public.notification_preferences (user_id, email_address) values (new.id, new.email);

  insert into public.categories (user_id, name, kind, color, is_default)
  select new.id, c.name, c.kind, c.color, true
  from (values
    ('Salary', 'income', '#0f766e'), ('Business income', 'income', '#0d9488'),
    ('Freelance', 'income', '#14b8a6'), ('Other income', 'income', '#5eead4'),
    ('Housing', 'expense', '#1e3a8a'), ('Utilities', 'expense', '#1d4ed8'),
    ('Groceries', 'expense', '#2563eb'), ('Transport', 'expense', '#3b82f6'),
    ('Fuel', 'expense', '#60a5fa'), ('Dining', 'expense', '#7c3aed'),
    ('Health', 'expense', '#db2777'), ('Education', 'expense', '#ea580c'),
    ('Airtime & data', 'expense', '#ca8a04'), ('Entertainment', 'expense', '#9333ea'),
    ('Supplies', 'expense', '#475569'), ('Professional services', 'expense', '#334155'),
    ('Taxes & fees', 'expense', '#b91c1c'), ('Other expense', 'expense', '#64748b')
  ) as c(name, kind, color);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail for sensitive financial & integration records
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  uid uuid;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  uid := (rec ->> 'user_id')::uuid;
  -- The user row may already be gone during an account-deletion cascade.
  if not exists (select 1 from auth.users where id = uid) then
    return null;
  end if;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    uid,
    lower(tg_op),
    tg_table_name,
    (rec ->> 'id')::uuid,
    jsonb_strip_nulls(jsonb_build_object(
      'amount', rec ->> 'amount',
      'currency', rec ->> 'currency',
      'title', coalesce(rec ->> 'title', rec ->> 'name', rec ->> 'description', rec ->> 'email_address'),
      'actor', coalesce((select auth.uid())::text, 'system')
    ))
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['transactions', 'budgets', 'bills', 'businesses', 'email_accounts', 'recurring_transactions'] loop
    execute format('create trigger audit_changes after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Authenticated users can append their own audit entries via this function
-- (e.g. "data_export"), but cannot forge entries for anyone else.
create or replace function public.log_audit(p_action text, p_entity_type text default null,
                                            p_entity_id uuid default null, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  select auth.uid(), left(p_action, 80), p_entity_type, p_entity_id, coalesce(p_metadata, '{}')
  where auth.uid() is not null;
$$;
revoke all on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, keyed per user + bucket)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  k text := coalesce(auth.uid()::text, 'anon') || ':' || p_bucket;
  current_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (k, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into current_count;
  return current_count <= p_limit;
end $$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reminder dispatch: atomically claim due reminders (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_reminders(p_limit integer default 100)
returns setof public.scheduled_reminders language sql security definer set search_path = public as $$
  update public.scheduled_reminders r
  set status = 'processing', attempts = r.attempts + 1, updated_at = now()
  where r.id in (
    select id from public.scheduled_reminders
    where (status = 'pending' and fire_at <= now())
       -- recover rows stuck in processing (e.g. crashed worker) after 10 minutes
       or (status = 'processing' and updated_at < now() - interval '10 minutes' and attempts < 5)
    order by fire_at
    limit p_limit
    for update skip locked
  )
  returning r.*;
$$;
revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, files stored under "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel'
])
on conflict (id) do nothing;

create policy "attachments owner read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "attachments owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
