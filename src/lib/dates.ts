import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

/** yyyy-MM-dd for "now" in the given IANA timezone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, safeTz(tz), "yyyy-MM-dd");
}

export function safeTz(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** UTC instant for the start of a local calendar day (yyyy-MM-dd) in tz. */
export function startOfLocalDay(date: string, tz: string): Date {
  return fromZonedTime(`${date}T00:00:00`, safeTz(tz));
}

/** UTC instant for the end (exclusive) of a local day. */
export function endOfLocalDay(date: string, tz: string): Date {
  return startOfLocalDay(addDaysToDateString(date, 1), tz);
}

export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Converts a local wall-clock "yyyy-MM-ddTHH:mm" in tz to a UTC Date. */
export function localInputToUtc(local: string, tz: string): Date {
  return fromZonedTime(local.length === 16 ? `${local}:00` : local, safeTz(tz));
}

/** Formats a UTC instant as "yyyy-MM-ddTHH:mm" in tz, for <input type="datetime-local">. */
export function utcToLocalInput(iso: string | Date | null | undefined, tz: string): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), safeTz(tz), "yyyy-MM-dd'T'HH:mm");
}

export function fmt(iso: string | Date, tz: string, pattern: string): string {
  return formatInTimeZone(new Date(iso), safeTz(tz), pattern);
}

export function zoned(iso: string | Date, tz: string): Date {
  return toZonedTime(new Date(iso), safeTz(tz));
}

/** Local HH:mm (24h) of an instant in tz. */
export function localTime(now: Date, tz: string): string {
  return formatInTimeZone(now, safeTz(tz), "HH:mm");
}

/** True when local time hh:mm lies within [start, end), handling windows that cross midnight. */
export function inQuietHours(localHHmm: string, start: string, end: string): boolean {
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  if (s === e) return false;
  return s < e ? localHHmm >= s && localHHmm < e : localHHmm >= s || localHHmm < e;
}

/** Next UTC instant at which the local clock in tz reads hh:mm (strictly after `after`). */
export function nextLocalTime(hhmm: string, tz: string, after: Date): Date {
  const today = todayInTz(tz, after);
  for (let i = 0; i < 3; i++) {
    const candidate = fromZonedTime(`${addDaysToDateString(today, i)}T${hhmm.slice(0, 5)}:00`, safeTz(tz));
    if (candidate > after) return candidate;
  }
  return addDays(after, 1);
}

export function relativeDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDaysToDateString(today, 1)) return "Tomorrow";
  if (date === addDaysToDateString(today, -1)) return "Yesterday";
  return "";
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.UTC(+fromDate.slice(0, 4), +fromDate.slice(5, 7) - 1, +fromDate.slice(8, 10));
  const b = Date.UTC(+toDate.slice(0, 4), +toDate.slice(5, 7) - 1, +toDate.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export const COMMON_TIMEZONES = [
  "Africa/Harare", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "Africa/Cairo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "UTC",
];
