# LifePilot AI

A personal & business assistant: finances and budgets, multiple businesses, tasks and projects, calendar, email intelligence, an AI assistant that works from your own records, and reliable server-scheduled reminders — in one responsive, installable web app.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Radix UI primitives · Recharts · Supabase (Postgres, Auth, Storage, RLS) · OpenAI Chat Completions (server-side) · Gmail API / Microsoft Graph · Web Push (VAPID) · Resend (optional email reminders).

---

## Contents

1. [What's included](#whats-included)
2. [Architecture](#architecture)
3. [Quick start (local)](#quick-start-local)
4. [Configuration & credentials](#configuration--credentials) — what each integration needs and what it costs
5. [Scheduler (reminders, briefings, sync)](#scheduler)
6. [Deploying to Vercel](#deploying-to-vercel)
7. [Security model](#security-model)
8. [Testing](#testing)
9. [Known limitations](#known-limitations)

---

## What's included

| Area | Highlights |
|---|---|
| **Auth** | Email + password (Supabase Auth), email confirmation, password reset, secure cookie sessions refreshed in `src/proxy.ts`. |
| **Dashboard** | Greeting & live local time, daily briefing (AI or rule-based, always from your data), today's schedule, tasks due/overdue, deadlines, month income/expenses per currency, budget utilisation, bills & receivables, important/unanswered email & follow-ups, business priorities, notification centre, recent activity, quick actions. |
| **Personal finance** | Income/expenses with categories, payment method, counterparty, notes, receipts; custom categories; recurring entries (auto-recorded); bills **and** receivables with part-payments, recurrence and reminders; multi-currency (USD, ZWG, ZAR, EUR, GBP, BWP — totals are never mixed); search/filter; CSV export; monthly/quarterly/annual budgets with threshold alerts and period-end projection. |
| **Business** | Unlimited businesses/projects, each with its own transactions, budgets, invoices/bills, projects (status, priority, deadlines), tasks (with contact assignment), meetings, contacts, documents and performance report. Consolidated views never merge the underlying records. Archive or delete (typed confirmation). |
| **Calendar** | Day / week / month / agenda views, recurring events (RRULE) with “skip this occurrence”, all-day events, locations, reminders, conflict detection with explicit override, cancel/reschedule, search & filters; task deadlines and bills shown in context; two-way Google/Outlook sync. |
| **Tasks** | List / kanban (drag & drop + keyboard-accessible "Move to") / calendar views; priority, status, category, personal/business/project association, subtasks, checklists, attachments, recurring tasks (next instance on completion), reminder schedules, completion timestamps, overdue highlighting. |
| **Email** | Gmail & Outlook via OAuth (PKCE). Inbox metadata sync; bodies fetched on demand (not stored). Summaries and extraction of tasks, meetings, invoices/payables, receivables, deadlines and follow-ups — each shown with the quoted evidence and **only created after you review a pre-filled form**. Reply drafts (AI or manual), save to Gmail/Outlook drafts, send only after an explicit confirmation dialog. Manual paste-in workflow when no mailbox is connected. |
| **AI assistant** | Floating panel on every page + full page with history. Tool calling over your real records (tasks, schedule, finances, budgets, bills, email, deadlines, business reports). Any change (task, event, reminder, follow-up, draft, transaction) is a **proposal** you confirm or reject; every proposal and outcome is logged. |
| **Notifications** | In-app notification centre, Web Push (works with the app closed, incl. installed iOS 16.4+ PWAs), optional email reminders; task, meeting, bill, receivable, budget and follow-up reminders; custom & recurring reminders; daily briefing and weekly summary; quiet hours; per-type toggles; time-zone aware; de-duplicated. |
| **Reports** | Income vs expenditure, spending by category, budget vs actual, net cash-flow trend, monthly & annual comparisons, outstanding payments, task completion & on-time rates, business performance. Filters by date, scope (personal / business / consolidated), category and type; CSV export and print stylesheet. |
| **Settings** | Profile (name, time zone, default currency), theme (light/dark/system), password, notification preferences & push per device, integrations status and connections, demo mode, full data export (JSON), account deletion, AI action log and audit trail. |
| **PWA** | Web manifest, icons, service worker (push, notification clicks, offline page). Financial/email data is never cached offline. |

**Demo mode:** *Settings → Data & privacy → Load demo data* inserts sample records, every one flagged `is_demo` and shown with a “Demo” badge plus a banner. One click removes them. Nothing sample is ever presented as connected data.

---

## Architecture

```
src/
  proxy.ts                    Session refresh + route guard (Next 16 "proxy", formerly middleware)
  app/
    (auth)/                   login, signup, forgot/reset password
    (app)/                    authenticated app: dashboard, finance/*, business/*, calendar, tasks,
                              email/*, assistant, reports, notifications, settings/*
    actions/                  Server Actions (all input validated with zod; RLS-scoped client)
    api/
      cron/tick               Scheduler entry point (CRON_SECRET)
      ai/chat, ai/actions/[id], ai/briefing
      integrations/[provider]/connect|callback   OAuth (PKCE + single-use state)
      push/subscribe, push/test, attachments, export/*, account/delete, health
  lib/
    finance.ts, money.ts, dates.ts, recurrence.ts     Pure, unit-tested calculation code
    reminders/planner.ts       Materialises reminders ≤48h ahead (idempotent dedupe keys)
    reminders/dispatcher.ts    Claims due reminders (FOR UPDATE SKIP LOCKED) and delivers them
    notify.ts, push.ts, mailer.ts, budget-alerts.ts
    integrations/              google.ts, microsoft.ts, tokens.ts (encrypted), mail-sync.ts, calendar-sync.ts
    ai/                        openai.ts, tools.ts (read tools + write proposals), assistant.ts, execute.ts,
                               briefing.ts, email-analysis.ts (AI + rule-based fallback)
supabase/
  migrations/                  Schema, indexes, RLS, triggers, RPCs, storage bucket & policies
  tests/                       Supabase stub + RLS isolation tests (plain Postgres)
  cron.sql                     Optional pg_cron + pg_net scheduler
```

**Data model (all tables have UUID PKs, timestamps, `user_id`, indexes):** profiles, businesses, projects, contacts, categories, transactions, recurring_transactions, budgets, bills (payables + receivables), tasks, task_checklist_items, calendar_events, email_accounts, email_account_tokens (server-only), oauth_states (server-only), email_messages, email_insights, email_drafts, attachments, notification_preferences, push_subscriptions, scheduled_reminders, notifications, daily_briefings, ai_conversations, ai_messages, ai_action_logs, audit_logs, rate_limits.

Personal vs business separation: `business_id IS NULL` = personal. Business-scoped rows use composite foreign keys `(business_id, user_id) → businesses(id, user_id)`, so a row can never be attached to someone else's business, even by a buggy query.

---

## Quick start (local)

Prerequisites: Node.js ≥ 20.9, a Supabase project (free tier is fine) **or** the Supabase CLI with Docker for a local stack.

```bash
npm install
cp .env.example .env.local        # fill in the REQUIRED section
```

1. **Create the database schema.** Either:
   - Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - Dashboard: open *SQL Editor* and run the files in `supabase/migrations/` in filename order.
2. **Auth settings** (Supabase → Authentication):
   - *URL Configuration*: Site URL = your app URL; add `http://localhost:3000/**` and your production URL to Redirect URLs.
   - Email confirmation can stay on (users confirm via `/auth/confirm`) or be turned off for testing.
3. Generate secrets:
   ```bash
   openssl rand -base64 48      # TOKEN_ENCRYPTION_KEY
   openssl rand -hex 32         # CRON_SECRET
   npx web-push generate-vapid-keys   # NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (optional)
   ```
4. Run it:
   ```bash
   npm run dev                  # http://localhost:3000
   ```
5. To test reminders locally, trigger the scheduler manually (or with a loop):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
   ```

If Supabase variables are missing, the app shows `/setup` explaining what's needed instead of crashing.

---

## Configuration & credentials

Everything optional degrades gracefully: the UI shows "not configured" with instructions and never fakes a connection (see *Settings → Integrations*, or `GET /api/health` for booleans).

| Feature | Variables | Where to get them | Cost |
|---|---|---|---|
| Core (required) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Free tier; Pro from ~$25/month for production backups/limits |
| Token encryption (required for integrations) | `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 48` | — |
| Scheduler (required for reminders) | `CRON_SECRET` | random secret | Vercel Cron (Pro for sub-daily) or Supabase pg_cron (free) |
| AI assistant & analysis | `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4.1-mini`), optional `OPENAI_BASE_URL` | platform.openai.com | Pay-as-you-go per token. Typical personal use with a mini model: low single-digit USD/month. Rate-limited per user in-app. |
| Web Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` | Free |
| Email reminders | `RESEND_API_KEY`, `REMINDER_EMAIL_FROM` | resend.com (verify a sending domain) | Free tier (3k emails/month), paid above |
| Gmail + Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console | Free API quota |
| Outlook mail + calendar | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Microsoft Entra ID | Free |

> **Why Web Push rather than Firebase Cloud Messaging?** For a web/PWA app, standard Web Push with VAPID keys reaches Chrome, Edge, Firefox, Android and iOS/iPadOS 16.4+ home-screen apps directly, with no Firebase project, SDK or cost. FCM would only add value for future native mobile apps; the notification pipeline (`src/lib/notify.ts`) is channel-based so an FCM sender can be added alongside `push.ts` later.

### Google (Gmail + Calendar)

1. Google Cloud Console → create a project → *APIs & Services → Library*: enable **Gmail API** and **Google Calendar API**.
2. *OAuth consent screen*: External (or Internal for Workspace), add your email as a test user while in *Testing*.
3. *Credentials → Create credentials → OAuth client ID → Web application*.
   Authorised redirect URI: `https://YOUR-APP/api/integrations/google/callback` (and `http://localhost:3000/api/integrations/google/callback` for dev).
4. Scopes requested (minimum for the features): `openid email profile`, `gmail.readonly` (read metadata/bodies on demand), `gmail.compose` (create drafts; send only after explicit confirmation), `calendar.events` (two-way sync). No delete or settings scopes.
5. **Important:** `gmail.readonly` is a *restricted* scope. In *Testing* mode it works for listed test users, but Google expires refresh tokens after 7 days (users must reconnect). Publishing for other users requires Google's verification and an annual third-party security assessment. For a single owner, keep the app in Testing or use an Internal (Workspace) app.

### Microsoft (Outlook + Calendar)

1. Entra ID → *App registrations → New registration*. Supported account types: personal + work accounts (matches `MICROSOFT_TENANT_ID=common`).
2. Redirect URI (platform **Web**): `https://YOUR-APP/api/integrations/microsoft/callback`.
3. *Certificates & secrets* → new client secret → `MICROSOFT_CLIENT_SECRET` (note its expiry).
4. *API permissions* (Microsoft Graph, delegated): `User.Read`, `Mail.ReadWrite` (drafts), `Mail.Send` (send only after confirmation), `Calendars.ReadWrite`, `offline_access`, `openid`, `email`, `profile`. Admin consent is only needed if your tenant requires it.

Tokens are exchanged server-side, encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`, and stored in `email_account_tokens`, which has RLS enabled with no policies and privileges revoked from browser roles. Disconnecting revokes (Google) and deletes tokens and synced mail metadata.

---

## Scheduler

`/api/cron/tick` (authenticated with `Authorization: Bearer $CRON_SECRET`) runs idempotent steps:

1. Record due recurring transactions (unique `(recurring_id, occurred_on)` prevents duplicates) and re-check budget thresholds.
2. **Plan** reminders up to 48 hours ahead for every user — task due & lead-time reminders, (recurring) event reminders, bill/receivable reminders at 08:00 local, email follow-ups, daily briefing, weekly summary. Each has a deterministic `dedupe_key`, unique per user, so planning repeatedly never creates duplicates.
3. **Dispatch** due reminders: rows are claimed atomically (`FOR UPDATE SKIP LOCKED`), re-validated (task still open? event not cancelled? bill unpaid? preference still on?), deferred to the end of quiet hours in the user's time zone if needed, then delivered in-app + push + email. Notifications are also de-duplicated by key; failures retry with back-off; stuck rows are recovered.
4. Sync connected mailboxes/calendars not synced in the last 15 minutes.

Run it **every 1–5 minutes**. Options:

- **Supabase pg_cron + pg_net (free, recommended on Vercel Hobby):** edit and run `supabase/cron.sql`.
- **Vercel Cron:** `vercel.json` ships with a once-daily schedule because Hobby plans reject anything more frequent. On Vercel Pro, change it to `*/5 * * * *`. Vercel sends `CRON_SECRET` automatically.
- Any external scheduler (cron-job.org, GitHub Actions, a server crontab) calling the URL with the header.

Reminders still appear in the in-app notification centre even if push isn't enabled on a device; push delivery requires the user to enable it per device in *Settings → Notifications*.

---

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel (framework preset: Next.js).
2. Add all environment variables from `.env.example` (Production + Preview). Set `NEXT_PUBLIC_APP_URL` to the production URL.
3. Deploy. Then:
   - Supabase → Authentication → URL Configuration: add the production URL to Site URL / Redirect URLs.
   - Add the production OAuth redirect URIs in Google/Microsoft consoles.
   - Set up the scheduler (see above) and confirm with `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/tick`.
4. Open the site on your phone and *Add to Home Screen* to install the PWA; enable push in *Settings → Notifications* and use **Send test**.

Any Node.js host works (`npm run build && npm start`); only the scheduler trigger differs.

---

## Security model

- **Authentication:** Supabase Auth with HTTP-only cookie sessions; every server action / route handler re-validates the user with `auth.getUser()`.
- **Authorisation:** Row Level Security on every user table (`user_id = auth.uid()`); composite FKs for business ownership; server-only tables have RLS with no policies; browser roles may only update the sync toggles of an integration (column-level grants).
- **Service role** is used only in trusted server paths (scheduler, OAuth token storage, account deletion, provider sync) and always scoped by `user_id`.
- **Input validation:** zod schemas for all forms, API bodies, filters and AI tool arguments (re-validated again at execution).
- **AI safety:** read tools are RLS-scoped; write tools only create *proposals*; execution requires an explicit confirmation request, is single-use (claimed atomically), expires after 24h, and is logged. The assistant is instructed never to invent data or estimate money amounts.
- **Email safety:** no delete/settings scopes; nothing is sent without a confirmation dialog; extracted information is suggested, never auto-created; bodies are fetched on demand and not stored.
- **Rate limiting:** per-user fixed windows in Postgres (`check_rate_limit`) for AI chat, analysis, drafts, sending, uploads, exports, OAuth and manual sync.
- **Uploads:** private storage bucket, per-user folder policies, 10 MB limit, MIME allow-list + extension match + magic-byte sniffing, short-lived signed download URLs.
- **Audit:** DB triggers log inserts/updates/deletes on transactions, budgets, bills, businesses, recurring entries and integrations; app events (exports, connections, sends, password changes, demo data) are logged via `log_audit`. Users can read but never modify their trail.
- **Privacy:** full JSON export (no tokens), CSV export, one-step account deletion (storage files + cascade).
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, HSTS, strict referrer policy; CSV exports are protected against formula injection.

---

## Testing

```bash
npm run typecheck     # Next route types + TypeScript
npm run lint
npm test              # Vitest: finance maths, budgets, periods, time zones, quiet hours,
                      # recurrence & conflicts, reminder planning, CSV, validation, email rules
npm run test:db       # Applies migrations to a scratch Postgres and runs RLS isolation tests
                      # (requires PGHOST/PGPORT/PGUSER pointing at a PostgreSQL 15+ server)
```

`test:db` covers: new-user bootstrap, cross-user read/write/delete isolation, forged `user_id` rejection, cross-tenant business FK rejection, server-only token table lockdown, column-level integration grants, storage folder policies, rate limiter, claim-once reminder dispatch, validation constraints and full cascade on account deletion.

---

## Known limitations

- **Recurring event times** are expanded in UTC, which is exact for zones without daylight saving (e.g. Africa/Harare) but can shift by an hour across DST changes for local-only recurring events. Provider-synced recurring events are imported as individual instances and are unaffected.
- **Synced calendars:** the primary Google calendar / default Outlook calendar is synced in a rolling window (30 days back, 180 ahead). Recurring series created in LifePilot are pushed as series; editing a single synced instance edits only that instance.
- **Mail sync** reads the last 14 days of the inbox (50 most recent) every ~15 minutes; it is metadata-oriented, not a full mail client.
- **Currencies** are tracked separately; there is no exchange-rate conversion (by design — no estimated figures).
- **Bank connections** are intentionally not included; transactions are recorded manually, from bills, from recurring templates, or (with confirmation) via the assistant.
