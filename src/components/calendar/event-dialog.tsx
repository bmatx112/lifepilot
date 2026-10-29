"use client";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton, useFormAction } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { ProjectSelect, REPEAT_OPTIONS, ReminderOffsets, ScopeSelect } from "@/components/ui/fields";
import { saveEvent } from "@/app/actions/calendar";
import { useLookups } from "@/components/layout/lookups";
import { addDaysToDateString, utcToLocalInput } from "@/lib/dates";
import { parseSimpleRule } from "@/lib/recurrence";
import type { CalendarEvent } from "@/lib/types";
import { TriangleAlert } from "lucide-react";

export interface EventDefaults {
  title?: string;
  start_local?: string;
  end_local?: string;
  location?: string;
  description?: string;
  kind?: CalendarEvent["kind"];
  business_id?: string | null;
  source?: string;
  source_ref?: string;
}

export function EventDialog({ open, onOpenChange, event, defaults, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; event?: CalendarEvent | null; defaults?: EventDefaults; onSaved?: () => void }) {
  const { timezone, calendarAccounts, defaultEventReminders } = useLookups();
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [scope, setScope] = useState<string>(event?.business_id ?? defaults?.business_id ?? "personal");
  const { formAction, fieldErrors, state, pending } = useFormAction(saveEvent, { onSuccess: () => { onOpenChange(false); onSaved?.(); } });
  const conflicts = state && !state.ok ? state.fieldErrors?.conflict : undefined;

  const startLocal = event ? utcToLocalInput(event.starts_at, timezone) : defaults?.start_local ?? "";
  // All-day events store an exclusive end; show the inclusive last day.
  const endLocal = event
    ? event.all_day ? addDaysToDateString(utcToLocalInput(event.ends_at, timezone).slice(0, 10), -1) + "T00:00" : utcToLocalInput(event.ends_at, timezone)
    : defaults?.end_local ?? "";
  const rule = parseSimpleRule(event?.recurrence_rule);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={event ? "Edit event" : "New event"} wide>
        <form onSubmit={formAction} className="grid gap-3">
          {event ? <input type="hidden" name="id" value={event.id} /> : null}
          {defaults?.source ? <input type="hidden" name="source" value={defaults.source} /> : null}
          {defaults?.source_ref ? <input type="hidden" name="source_ref" value={defaults.source_ref} /> : null}
          <Field label="Title" htmlFor="e-title" error={fieldErrors.title}>
            <Input id="e-title" name="title" defaultValue={event?.title ?? defaults?.title} required autoFocus />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox name="all_day" label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span className="text-xs text-muted-foreground">Times in {timezone}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={allDay ? "Start date" : "Starts"} htmlFor="e-start" error={fieldErrors.start}>
              <Input key={`s-${allDay}`} id="e-start" name="start" type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? startLocal.slice(0, 10) : startLocal} required />
            </Field>
            <Field label={allDay ? "End date" : "Ends"} htmlFor="e-end" error={fieldErrors.end}>
              <Input key={`e-${allDay}`} id="e-end" name="end" type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? endLocal.slice(0, 10) : endLocal} required />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Type" htmlFor="e-kind">
              <Select id="e-kind" name="kind" defaultValue={event?.kind ?? defaults?.kind ?? "meeting"}>
                <option value="meeting">Meeting</option><option value="appointment">Appointment</option><option value="personal">Personal</option><option value="business">Business</option><option value="deadline">Deadline</option>
              </Select>
            </Field>
            <Field label="Belongs to" htmlFor="e-scope"><ScopeSelect id="e-scope" defaultValue={scope} onChange={setScope} /></Field>
            <Field label="Project" htmlFor="e-proj"><ProjectSelect key={scope} id="e-proj" businessId={scope} defaultValue={event?.project_id} /></Field>
          </div>
          <Field label="Location" htmlFor="e-loc"><Input id="e-loc" name="location" defaultValue={event?.location ?? defaults?.location ?? ""} placeholder="Address or meeting link" /></Field>
          <Field label="Description" htmlFor="e-desc"><Textarea id="e-desc" name="description" rows={2} defaultValue={event?.description ?? defaults?.description ?? ""} /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Repeat" htmlFor="e-rep">
              <Select id="e-rep" name="repeat" defaultValue={rule.freq}>{REPEAT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Repeat until (optional)" htmlFor="e-until"><Input id="e-until" type="date" name="repeat_until" defaultValue={rule.until ?? ""} /></Field>
          </div>
          {event ? (
            <Field label="Status" htmlFor="e-status">
              <Select id="e-status" name="status" defaultValue={event.status}><option value="confirmed">Confirmed</option><option value="tentative">Tentative</option><option value="cancelled">Cancelled</option></Select>
            </Field>
          ) : null}
          {!event && calendarAccounts.length ? (
            <Field label="Also add to" htmlFor="e-sync" hint="Creates the event in the connected calendar (two-way sync).">
              <Select id="e-sync" name="sync_account_id" defaultValue="">
                <option value="">LifePilot only</option>
                {calendarAccounts.map((a) => <option key={a.id} value={a.id}>{a.provider === "google" ? "Google Calendar" : "Outlook"} — {a.email_address}</option>)}
              </Select>
            </Field>
          ) : null}
          <ReminderOffsets defaultValue={event ? event.reminder_offsets : defaultEventReminders} />
          {conflicts?.length ? (
            <Alert tone="warning" title="Schedule conflict" icon={<TriangleAlert />}>
              <ul className="list-disc pl-4">{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
              <Checkbox name="force" className="mt-2" label="Save anyway" />
            </Alert>
          ) : null}
          <div className="flex justify-end pt-1"><SubmitButton pending={pending} variant="accent" pendingText="Saving…">{event ? "Save changes" : "Create event"}</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
