import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { providerFetch } from "@/lib/integrations/tokens";
import { startOfLocalDay } from "@/lib/dates";
import type { DraftInput, NormalizedEvent, NormalizedMessage, OutgoingEvent } from "@/lib/integrations/types";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

type Header = { name: string; value: string };

function header(headers: Header[] | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export function parseAddress(v: string | null): { name: string | null; email: string | null } {
  if (!v) return { name: null, email: null };
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: v.trim().toLowerCase() };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

export async function googleProfile(token: string) {
  const r = await providerFetch(token, "https://openidconnect.googleapis.com/v1/userinfo");
  return { email: r.email as string, name: (r.name as string) ?? null };
}

export async function googleListMessages(token: string, days = 14, max = 50): Promise<NormalizedMessage[]> {
  const list = await providerFetch(token, `${GMAIL}/messages?maxResults=${max}&q=${encodeURIComponent(`in:inbox newer_than:${days}d`)}`);
  const ids: string[] = (list?.messages ?? []).map((m: { id: string }) => m.id);
  const metas = await mapLimit(ids, 8, (id) =>
    providerFetch(token, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`),
  );
  return metas.map((m) => {
    const from = parseAddress(header(m.payload?.headers, "From"));
    const labels: string[] = m.labelIds ?? [];
    return {
      providerId: m.id,
      threadId: m.threadId ?? null,
      fromName: from.name,
      fromEmail: from.email,
      to: (header(m.payload?.headers, "To") ?? "").split(",").map((s) => parseAddress(s).email).filter(Boolean) as string[],
      subject: header(m.payload?.headers, "Subject") ?? "(no subject)",
      snippet: decodeEntities(m.snippet ?? ""),
      receivedAt: new Date(Number(m.internalDate)).toISOString(),
      isUnread: labels.includes("UNREAD"),
      isImportant: labels.includes("IMPORTANT") || labels.includes("STARRED"),
    };
  });
}

function decodeEntities(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function b64urlDecode(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function extractText(part: Part): { plain: string | null; html: string | null } {
  let plain: string | null = null;
  let html: string | null = null;
  const walk = (p: Part) => {
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = b64urlDecode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64urlDecode(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return { plain, html };
}

export async function googleMessageBody(token: string, id: string): Promise<string> {
  const m = await providerFetch(token, `${GMAIL}/messages/${id}?format=full`);
  const { plain, html } = extractText(m.payload ?? {});
  return (plain ?? (html ? htmlToText(html) : m.snippet ?? "")).slice(0, 50_000);
}

function rfc822(input: DraftInput & { from?: string }) {
  const lines = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject.replace(/[\r\n]+/g, " ")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return Buffer.from(lines.join("\r\n") + "\r\n\r\n" + input.body, "utf8").toString("base64url");
}

export async function googleCreateDraft(token: string, d: DraftInput): Promise<string> {
  const r = await providerFetch(token, `${GMAIL}/drafts`, {
    method: "POST",
    body: JSON.stringify({ message: { raw: rfc822(d), ...(d.threadId ? { threadId: d.threadId } : {}) } }),
  });
  return r.id as string;
}

export async function googleSendDraft(token: string, draftId: string) {
  await providerFetch(token, `${GMAIL}/drafts/send`, { method: "POST", body: JSON.stringify({ id: draftId }) });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
type GEvent = {
  id: string; etag?: string; status?: string; summary?: string; description?: string; location?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; recurringEventId?: string;
};

export async function googleListEvents(token: string, from: Date, to: Date, tz: string): Promise<NormalizedEvent[]> {
  const out: NormalizedEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", showDeleted: "true", maxResults: "250", orderBy: "startTime",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const r = await providerFetch(token, `${GCAL}/events?${qs}`);
    for (const e of (r.items ?? []) as GEvent[]) {
      const allDay = Boolean(e.start?.date);
      const start = allDay ? startOfLocalDay(e.start!.date!, tz) : new Date(e.start?.dateTime ?? 0);
      const end = allDay ? startOfLocalDay(e.end!.date!, tz) : new Date(e.end?.dateTime ?? e.start?.dateTime ?? 0);
      out.push({
        externalId: e.id, etag: e.etag ?? null, title: e.summary ?? "(no title)", description: e.description ?? null,
        location: e.location ?? null, start, end: end < start ? start : end, allDay, cancelled: e.status === "cancelled",
        seriesId: e.recurringEventId ?? null,
      });
    }
    pageToken = r.nextPageToken;
  } while (pageToken && ++pages < 8);
  return out;
}

function toGoogle(ev: OutgoingEvent) {
  const body: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    status: ev.cancelled ? "cancelled" : "confirmed",
  };
  if (ev.allDay) {
    body.start = { date: formatInTimeZone(ev.start, ev.timezone, "yyyy-MM-dd") };
    body.end = { date: formatInTimeZone(ev.end, ev.timezone, "yyyy-MM-dd") };
  } else {
    body.start = { dateTime: ev.start.toISOString(), timeZone: ev.timezone };
    body.end = { dateTime: ev.end.toISOString(), timeZone: ev.timezone };
  }
  body.recurrence = ev.recurrenceRule ? [`RRULE:${ev.recurrenceRule.replace(/^RRULE:/, "")}`] : [];
  return body;
}

export async function googleUpsertEvent(token: string, ev: OutgoingEvent, externalId: string | null) {
  const r = externalId
    ? await providerFetch(token, `${GCAL}/events/${encodeURIComponent(externalId)}`, { method: "PATCH", body: JSON.stringify(toGoogle(ev)) })
    : await providerFetch(token, `${GCAL}/events`, { method: "POST", body: JSON.stringify(toGoogle(ev)) });
  return { externalId: r.id as string, etag: (r.etag as string) ?? null };
}

export async function googleDeleteEvent(token: string, externalId: string) {
  try {
    await providerFetch(token, `${GCAL}/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
  } catch (e) {
    // Already deleted remotely is fine.
    if (!/not found|deleted|410|404/i.test((e as Error).message)) throw e;
  }
}
