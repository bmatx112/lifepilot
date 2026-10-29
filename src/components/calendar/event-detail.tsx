"use client";
import { useState } from "react";
import { Ban, CalendarX, Clock, MapPin, Pencil, Repeat, Trash2, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/form";
import { EventDialog } from "@/components/calendar/event-dialog";
import { useLookups } from "@/components/layout/lookups";
import { cancelEvent, deleteEvent, skipOccurrence } from "@/app/actions/calendar";
import { describeRule } from "@/lib/recurrence";
import { fmt } from "@/lib/dates";
import type { SerializedOccurrence } from "@/components/calendar/calendar-view";

export function EventDetailDialog({ occurrence, onOpenChange }: { occurrence: SerializedOccurrence; onOpenChange: (o: boolean) => void }) {
  const { timezone, businesses } = useLookups();
  const [editing, setEditing] = useState(false);
  const ev = occurrence.event;
  const close = () => onOpenChange(false);
  if (editing) return <EventDialog open event={ev} onOpenChange={(o) => { if (!o) { setEditing(false); close(); } }} />;
  const sameDay = fmt(occurrence.start, timezone, "yyyy-MM-dd") === fmt(new Date(new Date(occurrence.end).getTime() - 1), timezone, "yyyy-MM-dd");
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title={ev.title}>
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="outline">{ev.kind}</Badge>
            {ev.status !== "confirmed" ? <Badge tone="warning">{ev.status}</Badge> : null}
            <Badge tone="outline">{ev.business_id ? businesses.find((b) => b.id === ev.business_id)?.name : "Personal"}</Badge>
            {ev.provider !== "local" ? <Badge tone={ev.sync_state === "error" ? "danger" : "info"}>{ev.provider === "google" ? "Google Calendar" : "Outlook"} · {ev.sync_state.replace("_", " ")}</Badge> : null}
            {ev.source === "ai" ? <Badge tone="accent">via assistant</Badge> : ev.source === "email" ? <Badge tone="info">from email</Badge> : null}
            {ev.is_demo ? <Badge tone="warning">Demo</Badge> : null}
          </div>
          <p className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" />
            {ev.all_day ? `${fmt(occurrence.start, timezone, "EEE d MMM yyyy")}${sameDay ? "" : ` – ${fmt(new Date(new Date(occurrence.end).getTime() - 1), timezone, "EEE d MMM")}`} (all day)`
              : `${fmt(occurrence.start, timezone, "EEE d MMM yyyy, HH:mm")} – ${fmt(occurrence.end, timezone, sameDay ? "HH:mm" : "EEE d MMM HH:mm")}`}
          </p>
          {ev.location ? <p className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{/^https?:\/\//.test(ev.location) ? <a href={ev.location} target="_blank" rel="noreferrer noopener" className="text-accent underline">{ev.location}</a> : ev.location}</p> : null}
          {ev.recurrence_rule ? <p className="flex items-center gap-2"><Repeat className="size-4 text-muted-foreground" />{describeRule(ev.recurrence_rule)}</p> : null}
          {ev.description ? <p className="whitespace-pre-wrap text-foreground/90">{ev.description}</p> : null}
          {ev.reminder_offsets.length ? <p className="text-xs text-muted-foreground">Reminders: {ev.reminder_offsets.map((m) => (m === 0 ? "at start" : m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} d`)).join(", ")} before</p> : null}
          {ev.sync_error ? <p className="flex items-center gap-1.5 text-xs text-destructive"><TriangleAlert className="size-3.5" />Sync error: {ev.sync_error}</p> : null}
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-1">
              <ActionButton size="sm" variant="ghost" className="text-destructive" action={() => deleteEvent(ev.id)} onDone={(r) => r.ok && close()}
                confirm={{ title: "Delete this event?", description: ev.recurrence_rule ? "All occurrences of this series will be deleted." : ev.provider !== "local" ? "It will also be removed from your connected calendar." : undefined }} confirmLabel="Delete"><Trash2 /> Delete</ActionButton>
              {ev.recurrence_rule ? (
                <ActionButton size="sm" variant="ghost" action={() => skipOccurrence(ev.id, occurrence.start)} onDone={(r) => r.ok && close()}><CalendarX /> Skip this one</ActionButton>
              ) : null}
              {ev.status !== "cancelled" ? (
                <ActionButton size="sm" variant="ghost" action={() => cancelEvent(ev.id)} onDone={(r) => r.ok && close()} confirm={{ title: "Cancel this event?", description: "It stays on record as cancelled and reminders stop." }} confirmLabel="Cancel event"><Ban /> Cancel</ActionButton>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit / reschedule</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
