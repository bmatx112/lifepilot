"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { saveNotificationPrefs } from "@/app/actions/settings";
import type { NotificationPreferences } from "@/lib/types";

// Unchecked checkboxes aren't submitted; a hidden "false" input precedes each so the value is always sent.
function PrefToggle({ prefs, name, label }: { prefs: NotificationPreferences; name: keyof NotificationPreferences; label: string }) {
  return (
    <>
      <input type="hidden" name={name} value="false" />
      <Checkbox name={name} value="true" defaultChecked={Boolean(prefs[name])} label={label} />
    </>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function NotificationPrefsForm({ prefs, timezone, emailConfigured }: { prefs: NotificationPreferences; timezone: string; emailConfigured: boolean }) {
  const { formAction, fieldErrors, pending } = useFormAction(saveNotificationPrefs);
  const t = (v: string) => v.slice(0, 5);
  return (
    <form onSubmit={formAction} className="space-y-4">
      <Card>
        <CardHeader><div><CardTitle>Channels</CardTitle><CardDescription>In-app notifications are always recorded.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3">
          <input type="hidden" name="in_app_enabled" value="true" />
          <PrefToggle prefs={prefs} name="push_enabled" label="Push notifications (on devices where you enabled them)" />
          <PrefToggle prefs={prefs} name="email_enabled" label="Email reminders" />
          {!emailConfigured ? <Alert tone="warning">Email reminders are not configured on the server (RESEND_API_KEY and REMINDER_EMAIL_FROM). Your preference is saved and will apply once configured.</Alert> : null}
          <Field label="Send email reminders to" htmlFor="np-email" error={fieldErrors.email_address}><Input id="np-email" name="email_address" type="email" defaultValue={prefs.email_address ?? ""} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>What to notify me about</CardTitle></div></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <PrefToggle prefs={prefs} name="task_reminders_enabled" label="Task deadlines" />
          <PrefToggle prefs={prefs} name="event_reminders_enabled" label="Meetings & events" />
          <PrefToggle prefs={prefs} name="bill_reminders_enabled" label="Bill & receivable due dates" />
          <PrefToggle prefs={prefs} name="budget_alerts_enabled" label="Budget thresholds" />
          <PrefToggle prefs={prefs} name="follow_up_reminders_enabled" label="Email follow-ups" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Timing</CardTitle><CardDescription>All times in {timezone}.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Default task reminders (minutes before, comma-separated)" htmlFor="np-dt" error={fieldErrors.default_task_reminder_minutes}><Input id="np-dt" name="default_task_reminder_minutes" defaultValue={prefs.default_task_reminder_minutes.join(",")} /></Field>
          <Field label="Default event reminders (minutes before)" htmlFor="np-de" error={fieldErrors.default_event_reminder_minutes}><Input id="np-de" name="default_event_reminder_minutes" defaultValue={prefs.default_event_reminder_minutes.join(",")} /></Field>
          <div className="space-y-2 sm:col-span-2">
            <PrefToggle prefs={prefs} name="quiet_hours_enabled" label="Quiet hours (push and email are held until they end)" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" htmlFor="np-qs"><Input id="np-qs" type="time" name="quiet_hours_start" defaultValue={t(prefs.quiet_hours_start)} /></Field>
              <Field label="Until" htmlFor="np-qe"><Input id="np-qe" type="time" name="quiet_hours_end" defaultValue={t(prefs.quiet_hours_end)} /></Field>
            </div>
          </div>
          <div className="space-y-2">
            <PrefToggle prefs={prefs} name="daily_briefing_enabled" label="Daily briefing" />
            <Field label="Time" htmlFor="np-db"><Input id="np-db" type="time" name="daily_briefing_time" defaultValue={t(prefs.daily_briefing_time)} /></Field>
          </div>
          <div className="space-y-2">
            <PrefToggle prefs={prefs} name="weekly_summary_enabled" label="Weekly summary" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Day" htmlFor="np-wd"><Select id="np-wd" name="weekly_summary_day" defaultValue={prefs.weekly_summary_day}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
              <Field label="Time" htmlFor="np-wt"><Input id="np-wt" type="time" name="weekly_summary_time" defaultValue={t(prefs.weekly_summary_time)} /></Field>
            </div>
          </div>
        </CardContent>
      </Card>
      <SubmitButton pending={pending} variant="accent">Save preferences</SubmitButton>
    </form>
  );
}
