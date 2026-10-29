import { describe, expect, it } from "vitest";
import { planReminders } from "@/lib/reminders/planner";
import type { Bill, CalendarEvent, NotificationPreferences, Task } from "@/lib/types";

const prefs: NotificationPreferences = {
  user_id: "u", in_app_enabled: true, push_enabled: true, email_enabled: false, email_address: null,
  quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00",
  daily_briefing_enabled: true, daily_briefing_time: "07:00", weekly_summary_enabled: true, weekly_summary_day: 1, weekly_summary_time: "08:00",
  task_reminders_enabled: true, event_reminders_enabled: true, bill_reminders_enabled: true, budget_alerts_enabled: true,
  follow_up_reminders_enabled: true, default_task_reminder_minutes: [60], default_event_reminder_minutes: [15],
};
const now = new Date("2026-10-29T06:00:00Z"); // Thu 08:00 in Harare

const task = (o: Partial<Task>): Task => ({
  id: "t1", user_id: "u", business_id: null, project_id: null, parent_task_id: null, assignee_contact_id: null, title: "Pay rent",
  description: null, due_at: "2026-10-29T10:00:00Z", priority: "high", status: "pending", category: null, recurrence_rule: null,
  reminder_offsets: [60], completed_at: null, position: 0, source: "manual", source_ref: null, is_demo: false, created_at: "", ...o,
});

const base = { userId: "u", tz: "Africa/Harare", prefs, tasks: [] as Task[], events: [] as CalendarEvent[], bills: [] as Bill[], followUps: [], now };

describe("planReminders", () => {
  it("plans task due + lead reminders with stable dedupe keys", () => {
    const r = planReminders({ ...base, tasks: [task({})] });
    const t = r.filter((x) => x.entity_type === "task");
    expect(t.map((x) => x.fire_at).sort()).toEqual(["2026-10-29T09:00:00.000Z", "2026-10-29T10:00:00.000Z"]);
    expect(t.map((x) => x.dedupe_key)).toContain("task:t1:2026-10-29T10:00:00.000Z:60");
    // Idempotent: same input -> same keys
    expect(planReminders({ ...base, tasks: [task({})] }).map((x) => x.dedupe_key)).toEqual(r.map((x) => x.dedupe_key));
  });
  it("skips completed tasks, past times and disabled kinds", () => {
    expect(planReminders({ ...base, tasks: [task({ status: "completed" })] }).filter((x) => x.entity_type === "task")).toHaveLength(0);
    expect(planReminders({ ...base, tasks: [task({ due_at: "2026-10-28T10:00:00Z" })] }).filter((x) => x.entity_type === "task")).toHaveLength(0);
    expect(planReminders({ ...base, prefs: { ...prefs, task_reminders_enabled: false }, tasks: [task({})] }).filter((x) => x.entity_type === "task")).toHaveLength(0);
  });
  it("expands recurring events and plans each occurrence", () => {
    const ev = { id: "e1", user_id: "u", title: "Standup", starts_at: "2026-10-26T07:00:00Z", ends_at: "2026-10-26T07:15:00Z", recurrence_rule: "FREQ=DAILY", recurrence_exdates: [], reminder_offsets: [10], status: "confirmed", all_day: false, kind: "meeting" } as unknown as CalendarEvent;
    const r = planReminders({ ...base, events: [ev] }).filter((x) => x.entity_type === "event");
    expect(r.map((x) => x.fire_at)).toEqual(["2026-10-29T06:50:00.000Z", "2026-10-30T06:50:00.000Z"]);
  });
  it("plans bill reminders at 08:00 local", () => {
    const bill = { id: "b1", kind: "payable", title: "ZESA", amount: "20", currency: "USD", due_date: "2026-10-31", status: "open", reminder_days_before: 2 } as unknown as Bill;
    const r = planReminders({ ...base, bills: [bill] }).filter((x) => x.entity_type === "bill");
    // 2 days before and on the due date, both at 08:00 Harare (06:00 UTC); the latter sits on the 48h horizon edge.
    expect(r.map((x) => x.fire_at).sort()).toEqual(["2026-10-29T06:00:00.000Z", "2026-10-31T06:00:00.000Z"]);
    expect(r.find((x) => x.fire_at.startsWith("2026-10-29"))!.title).toContain("in 2 day(s)");
  });
  it("plans the next daily briefing once per local day", () => {
    const r = planReminders(base).filter((x) => x.kind === "daily_briefing");
    expect(r).toHaveLength(1);
    expect(r[0].fire_at).toBe("2026-10-30T05:00:00.000Z");
    expect(r[0].dedupe_key).toBe("briefing:2026-10-30");
  });
});
