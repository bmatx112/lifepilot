import { describe, expect, it } from "vitest";
import { inQuietHours, localInputToUtc, nextLocalTime, startOfLocalDay, todayInTz, utcToLocalInput } from "@/lib/dates";
import { buildRule, expandEvents, findConflicts, nextOccurrence, parseSimpleRule } from "@/lib/recurrence";
import type { CalendarEvent } from "@/lib/types";

describe("timezones", () => {
  it("computes local today", () => {
    const now = new Date("2026-10-29T23:30:00Z");
    expect(todayInTz("UTC", now)).toBe("2026-10-29");
    expect(todayInTz("Africa/Harare", now)).toBe("2026-10-30");
  });
  it("round-trips local inputs", () => {
    const utc = localInputToUtc("2026-10-29T09:00", "Africa/Harare");
    expect(utc.toISOString()).toBe("2026-10-29T07:00:00.000Z");
    expect(utcToLocalInput(utc.toISOString(), "Africa/Harare")).toBe("2026-10-29T09:00");
    expect(startOfLocalDay("2026-10-29", "Africa/Harare").toISOString()).toBe("2026-10-28T22:00:00.000Z");
  });
  it("quiet hours across midnight", () => {
    expect(inQuietHours("23:00", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("06:59", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:00", "07:00")).toBe(false);
    expect(inQuietHours("13:00", "12:00", "14:00")).toBe(true);
  });
  it("next local time", () => {
    const after = new Date("2026-10-29T06:00:00Z"); // 08:00 Harare
    expect(nextLocalTime("07:00", "Africa/Harare", after).toISOString()).toBe("2026-10-30T05:00:00.000Z");
    expect(nextLocalTime("09:00", "Africa/Harare", after).toISOString()).toBe("2026-10-29T07:00:00.000Z");
  });
});

const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1", user_id: "u", business_id: null, project_id: null, title: "Standup", description: null, location: null,
  kind: "meeting", starts_at: "2026-10-26T07:00:00Z", ends_at: "2026-10-26T07:30:00Z", all_day: false, timezone: "UTC",
  recurrence_rule: null, recurrence_exdates: [], status: "confirmed", reminder_offsets: [15], provider: "local",
  email_account_id: null, external_id: null, sync_state: "local", sync_error: null, source: "manual", is_demo: false, ...o,
});

describe("recurrence", () => {
  it("builds and parses rules", () => {
    expect(buildRule("weekdays", { until: "2026-12-31" })).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231T235959Z");
    expect(parseSimpleRule("FREQ=MONTHLY;INTERVAL=2;COUNT=5")).toEqual({ freq: "monthly", interval: 2, until: null, count: 5 });
    expect(buildRule("none")).toBeNull();
  });
  it("expands weekday recurrences with exdates", () => {
    const e = ev({ recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", recurrence_exdates: ["2026-10-28T07:00:00Z"] });
    const occ = expandEvents([e], new Date("2026-10-26T00:00:00Z"), new Date("2026-11-02T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-30"]);
  });
  it("detects conflicts", () => {
    const occ = expandEvents([ev({})], new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(findConflicts({ start: new Date("2026-10-26T07:15:00Z"), end: new Date("2026-10-26T08:00:00Z") }, occ)).toHaveLength(1);
    expect(findConflicts({ start: new Date("2026-10-26T07:30:00Z"), end: new Date("2026-10-26T08:00:00Z") }, occ)).toHaveLength(0);
    expect(findConflicts({ id: "e1", start: new Date("2026-10-26T07:15:00Z"), end: new Date("2026-10-26T08:00:00Z") }, occ)).toHaveLength(0);
  });
  it("next occurrence", () => {
    const n = nextOccurrence("FREQ=DAILY", new Date("2026-10-26T07:00:00Z"), new Date("2026-10-29T07:00:00Z"));
    expect(n?.toISOString()).toBe("2026-10-30T07:00:00.000Z");
    expect(nextOccurrence("FREQ=DAILY;COUNT=2", new Date("2026-10-26T07:00:00Z"), new Date("2026-10-29T07:00:00Z"))).toBeNull();
  });
});
