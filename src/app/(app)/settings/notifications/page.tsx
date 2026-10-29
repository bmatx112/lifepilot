import { requireUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PushSettings } from "@/components/notifications/push-settings";
import { NotificationPrefsForm } from "@/components/settings/notification-prefs-form";
import type { NotificationPreferences } from "@/lib/types";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const { supabase, user, profile } = await requireUser();
  const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id).single();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>Push notifications on this device</CardTitle><CardDescription>Arrive even when LifePilot is closed (subject to your browser and OS).</CardDescription></div></CardHeader>
        <CardContent><PushSettings /></CardContent>
      </Card>
      <NotificationPrefsForm prefs={data as NotificationPreferences} timezone={profile.timezone} emailConfigured={features.emailReminders()} />
    </div>
  );
}
