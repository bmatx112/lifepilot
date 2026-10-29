-- RLS / data-isolation tests. Run against a database with the migrations applied
-- (see scripts/test-db.sh). Any failed assertion raises an exception.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name":"Alice","timezone":"Africa/Harare"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{}');

-- Bootstrap trigger created profile, preferences and default categories
do $$ begin
  assert (select timezone from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Africa/Harare', 'profile timezone';
  assert (select count(*) from public.categories where user_id = '11111111-1111-1111-1111-111111111111') = 18, 'default categories';
  assert exists (select 1 from public.notification_preferences where user_id = '22222222-2222-2222-2222-222222222222'), 'prefs';
end $$;

-- ---- Act as Alice --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.businesses (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Consulting');
insert into public.transactions (user_id, business_id, type, amount, currency, occurred_on, description)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'income', 1500, 'USD', current_date, 'Retainer'),
       ('11111111-1111-1111-1111-111111111111', null, 'expense', 42.50, 'ZWG', current_date, 'Groceries');
insert into public.tasks (user_id, title) values ('11111111-1111-1111-1111-111111111111', 'Alice task');

do $$ begin
  assert (select count(*) from public.transactions) = 2, 'alice sees her 2 transactions';
  assert (select count(*) from public.audit_logs where entity_type = 'transactions') = 2, 'audit rows written';
end $$;

-- Alice cannot insert rows claiming to be Bob
do $$ begin
  begin
    insert into public.tasks (user_id, title) values ('22222222-2222-2222-2222-222222222222', 'forged');
    raise exception 'FORGE_OK';
  exception when insufficient_privilege then null;
           when others then if sqlerrm = 'FORGE_OK' then raise exception 'RLS allowed forged user_id'; end if;
  end;
end $$;

-- Alice cannot read tokens or rate-limit tables
do $$ begin
  begin
    perform 1 from public.email_account_tokens;
    raise exception 'TOKENS_READABLE';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Alice cannot run the dispatcher RPC
do $$ begin
  begin
    perform public.claim_due_reminders(1);
    raise exception 'CLAIM_OK';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Rate limiter
do $$ begin
  assert public.check_rate_limit('test', 2, 60), 'first call allowed';
  assert public.check_rate_limit('test', 2, 60), 'second call allowed';
  assert not public.check_rate_limit('test', 2, 60), 'third call blocked';
end $$;

-- Integration metadata: only sync toggles are writable from the browser
reset role;
insert into public.email_accounts (id, user_id, provider, email_address) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'google', 'alice@gmail.com');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.email_accounts set mail_sync_enabled = false where id = 'cccccccc-0000-0000-0000-000000000001';
do $$ begin
  begin
    update public.email_accounts set status = 'connected', scopes = '{evil}' where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'STATUS_WRITABLE';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.email_accounts (user_id, provider, email_address) values ('11111111-1111-1111-1111-111111111111', 'google', 'fake@x.com');
    raise exception 'ACCOUNT_INSERTABLE';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- Act as Bob ----------------------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$ begin
  assert (select count(*) from public.transactions) = 0, 'bob sees no transactions';
  assert (select count(*) from public.businesses) = 0, 'bob sees no businesses';
  assert (select count(*) from public.tasks) = 0, 'bob sees no tasks';
  assert (select count(*) from public.audit_logs) = 0, 'bob sees no audit logs';
  assert (select count(*) from public.profiles) = 1, 'bob sees only own profile';
  assert (select count(*) from public.categories) = 18, 'bob sees only own categories';
end $$;

-- Bob cannot update or delete Alice's data (silently affects 0 rows)
update public.transactions set amount = 1 where true;
delete from public.tasks where true;

-- Bob cannot attach his transaction to Alice's business (composite FK)
do $$ begin
  begin
    insert into public.transactions (user_id, business_id, type, amount, currency, occurred_on, description)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'expense', 1, 'USD', current_date, 'x');
    raise exception 'CROSS_TENANT_OK';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Storage policy: Bob can only write within his own folder
do $$ begin
  insert into storage.objects (bucket_id, name) values ('attachments', '22222222-2222-2222-2222-222222222222/receipt.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-1111-1111-111111111111/evil.pdf');
    raise exception 'STORAGE_CROSS_OK';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- Back to Alice: data intact ------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  assert (select count(*) from public.tasks) = 1, 'alice task survived bob delete';
  assert (select sum(amount) from public.transactions) = 1542.50, 'alice amounts unchanged';
end $$;

-- Validation constraints
do $$ begin
  begin
    insert into public.transactions (user_id, type, amount, currency, occurred_on, description)
    values ('11111111-1111-1111-1111-111111111111', 'expense', -5, 'USD', current_date, 'neg');
    raise exception 'NEG_OK';
  exception when check_violation then null;
  end;
end $$;

-- ---- Service role: dispatcher claims due reminders exactly once ----------
reset role;
insert into public.scheduled_reminders (user_id, kind, title, fire_at, dedupe_key)
values ('11111111-1111-1111-1111-111111111111', 'custom', 'Ping', now() - interval '1 minute', 'k1');
-- Duplicate dedupe key is rejected
insert into public.scheduled_reminders (user_id, kind, title, fire_at, dedupe_key)
values ('11111111-1111-1111-1111-111111111111', 'custom', 'Ping', now(), 'k1') on conflict do nothing;
set local role service_role;
do $$ begin
  assert (select count(*) from public.claim_due_reminders(10)) = 1, 'claimed once';
  assert (select count(*) from public.claim_due_reminders(10)) = 0, 'not claimed twice';
end $$;
reset role;

-- ---- Account deletion cascades everything --------------------------------
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.transactions where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'cascade tx';
  assert (select count(*) from public.audit_logs where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'cascade audit';
  assert (select count(*) from public.categories where user_id = '22222222-2222-2222-2222-222222222222') = 18, 'bob untouched';
end $$;

rollback;
\echo 'RLS isolation tests passed'
