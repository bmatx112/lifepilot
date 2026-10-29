import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { buttonVariants } from "@/components/ui/button";
import type { NotificationRow, ScheduledReminder } from "@/lib/types";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const [n, r] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("scheduled_reminders").select("*").eq("user_id", user.id).eq("status", "pending").order("fire_at").limit(100),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description="Alerts and reminders, delivered in-app, by push and by email according to your preferences."
        actions={<Link href="/settings/notifications" className={buttonVariants({ variant: "outline", size: "sm" })}>Preferences</Link>} />
      <NotificationsView notifications={(n.data ?? []) as NotificationRow[]} upcoming={(r.data ?? []) as ScheduledReminder[]} />
    </>
  );
}
