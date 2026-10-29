import { requireUser } from "@/lib/auth";
import { env, featureStatus } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";
import { LookupsProvider, type Lookups } from "@/components/layout/lookups";
import { ServiceWorkerRegistrar } from "@/components/notifications/sw-registrar";
import type { Business, Category, Contact, EmailAccount, Project } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user, profile } = await requireUser();
  const [businesses, categories, projects, contacts, accounts, prefs, unread, demo] = await Promise.all([
    supabase.from("businesses").select("*").eq("archived", false).order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("projects").select("*").in("status", ["planning", "active", "on_hold"]).order("name"),
    supabase.from("contacts").select("*").order("name"),
    supabase.from("email_accounts").select("id, provider, email_address, status, calendar_sync_enabled"),
    supabase.from("notification_preferences").select("default_task_reminder_minutes, default_event_reminder_minutes").eq("user_id", user.id).single(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);

  const lookups: Lookups = {
    userId: user.id,
    email: user.email ?? "",
    name: profile.full_name ?? user.email ?? "You",
    timezone: profile.timezone,
    currency: profile.default_currency,
    businesses: (businesses.data ?? []) as Business[],
    categories: (categories.data ?? []) as Category[],
    projects: (projects.data ?? []) as Project[],
    contacts: (contacts.data ?? []) as Contact[],
    calendarAccounts: ((accounts.data ?? []) as (EmailAccount & { calendar_sync_enabled: boolean })[])
      .filter((a) => a.status === "connected" && a.calendar_sync_enabled)
      .map((a) => ({ id: a.id, provider: a.provider, email_address: a.email_address })),
    defaultTaskReminders: prefs.data?.default_task_reminder_minutes ?? [60],
    defaultEventReminders: prefs.data?.default_event_reminder_minutes ?? [15],
    features: featureStatus(),
    vapidPublicKey: env.vapidPublicKey() ?? null,
  };

  return (
    <LookupsProvider value={lookups}>
      <ServiceWorkerRegistrar />
      <AppShell unread={unread.count ?? 0} demo={(demo.count ?? 0) > 0}>{children}</AppShell>
    </LookupsProvider>
  );
}
