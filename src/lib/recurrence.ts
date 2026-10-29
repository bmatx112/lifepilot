import { RRule, rrulestr, type RRuleSet } from "rrule";
import type { CalendarEvent, EventOccurrence } from "@/lib/types";

export type SimpleFrequency = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

/** Builds an RRULE string (without DTSTART) from simple form choices. */
export function buildRule(
  freq: SimpleFrequency,
  opts: { interval?: number; until?: string | null; count?: number | null } = {},
): string | null {
  if (freq === "none") return null;
  const parts: string[] = [];
  switch (freq) {
    case "daily": parts.push("FREQ=DAILY"); break;
    case "weekdays": parts.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR"); break;
    case "weekly": parts.push("FREQ=WEEKLY"); break;
    case "monthly": parts.push("FREQ=MONTHLY"); break;
    case "yearly": parts.push("FREQ=YEARLY"); break;
  }
  if (opts.interval && opts.interval > 1) parts.push(`INTERVAL=${Math.floor(opts.interval)}`);
  if (opts.until) parts.push(`UNTIL=${opts.until.replace(/-/g, "")}T235959Z`);
  else if (opts.count && opts.count > 0) parts.push(`COUNT=${Math.floor(opts.count)}`);
  return parts.join(";");
}

/** Best-effort reverse of buildRule for populating edit forms. */
export function parseSimpleRule(rule: string | null | undefined): {
  freq: SimpleFrequency;
  interval: number;
  until: string | null;
  count: number | null;
} {
  if (!rule) return { freq: "none", interval: 1, until: null, count: null };
  const map = Object.fromEntries(
    rule.replace(/^RRULE:/, "").split(";").map((p) => p.split("=") as [string, string]),
  );
  let freq: SimpleFrequency = "none";
  if (map.FREQ === "DAILY") freq = "daily";
  else if (map.FREQ === "WEEKLY") freq = map.BYDAY === "MO,TU,WE,TH,FR" ? "weekdays" : "weekly";
  else if (map.FREQ === "MONTHLY") freq = "monthly";
  else if (map.FREQ === "YEARLY") freq = "yearly";
  const until = map.UNTIL ? `${map.UNTIL.slice(0, 4)}-${map.UNTIL.slice(4, 6)}-${map.UNTIL.slice(6, 8)}` : null;
  return { freq, interval: Number(map.INTERVAL ?? 1), until, count: map.COUNT ? Number(map.COUNT) : null };
}

export function describeRule(rule: string | null | undefined): string {
  if (!rule) return "Does not repeat";
  try {
    return RRule.fromString(rule.replace(/^RRULE:/, "")).toText();
  } catch {
    return "Custom repeat";
  }
}

export function isValidRule(rule: string): boolean {
  try {
    RRule.fromString(rule.replace(/^RRULE:/, ""));
    return true;
  } catch {
    return false;
  }
}

/**
 * Occurrence start times of a rule anchored at dtstart, within [from, to].
 * Recurrence is evaluated in UTC: occurrences keep the same UTC time of day,
 * which is exact for zones without DST (e.g. Africa/Harare) and close otherwise.
 */
export function occurrencesBetween(rule: string, dtstart: Date, from: Date, to: Date, exdates: string[] = []): Date[] {
  const set = rrulestr(`DTSTART:${toRRuleDate(dtstart)}\nRRULE:${rule.replace(/^RRULE:/, "")}`, { forceset: true }) as RRuleSet;
  const ex = new Set(exdates.map((d) => new Date(d).getTime()));
  return set.between(from, to, true).filter((d) => !ex.has(d.getTime()));
}

/** First occurrence strictly after `after`, or null if the rule is exhausted. */
export function nextOccurrence(rule: string, dtstart: Date, after: Date): Date | null {
  const r = RRule.fromString(`DTSTART:${toRRuleDate(dtstart)}\nRRULE:${rule.replace(/^RRULE:/, "")}`);
  return r.after(after, false);
}

function toRRuleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Expands events (including recurring ones) into occurrences overlapping [from, to). */
export function expandEvents(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    const duration = end.getTime() - start.getTime();
    if (!ev.recurrence_rule) {
      if (start < to && end > from) out.push({ event: ev, start, end, key: `${ev.id}:${start.toISOString()}` });
      continue;
    }
    try {
      // Include occurrences that started before `from` but are still running.
      const starts = occurrencesBetween(ev.recurrence_rule, start, new Date(from.getTime() - duration), to, ev.recurrence_exdates);
      for (const s of starts) {
        const e = new Date(s.getTime() + duration);
        if (s < to && e > from) out.push({ event: ev, start: s, end: e, key: `${ev.id}:${s.toISOString()}` });
      }
    } catch {
      if (start < to && end > from) out.push({ event: ev, start, end, key: `${ev.id}:${start.toISOString()}` });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Pairs of occurrences that overlap in time (ignores cancelled and all-day events). */
export function findConflicts(
  candidate: { start: Date; end: Date; id?: string },
  occurrences: EventOccurrence[],
): EventOccurrence[] {
  return occurrences.filter(
    (o) =>
      o.event.id !== candidate.id &&
      o.event.status !== "cancelled" &&
      !o.event.all_day &&
      o.start < candidate.end &&
      o.end > candidate.start,
  );
}
