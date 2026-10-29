import "server-only";
import { providerFetch } from "@/lib/integrations/tokens";
import { htmlToText } from "@/lib/integrations/google";
import { parseSimpleRule } from "@/lib/recurrence";
import { formatInTimeZone } from "date-fns-tz";
import { startOfLocalDay } from "@/lib/dates";
import type { DraftInput, NormalizedEvent, NormalizedMessage, OutgoingEvent } from "@/lib/integrations/types";

const GRAPH = "https://graph.microsoft.com/v1.0/me";

export async function microsoftProfile(token: string) {
  const r = await providerFetch(token, `${GRAPH}?$select=displayName,mail,userPrincipalName`);
  return { email: ((r.mail ?? r.userPrincipalName) as string).toLowerCase(), name: (r.displayName as string) ?? null };
}

type GraphMsg = {
  id: string; conversationId?: string; subject?: string; bodyPreview?: string; receivedDateTime: string; isRead: boolean;
  importance?: string; inferenceClassification?: string; flag?: { flagStatus?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
};

export async function microsoftListMessages(token: string, days = 14, max = 50): Promise<NormalizedMessage[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const qs = new URLSearchParams({
    $top: String(max),
    $orderby: "receivedDateTime desc",
    $filter: `receivedDateTime ge ${since}`,
    $select: "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,importance,inferenceClassification,flag",
  });
  const r = await providerFetch(token, `${GRAPH}/mailFolders/inbox/messages?${qs}`);
  return ((r.value ?? []) as GraphMsg[]).map((m) => ({
    providerId: m.id,
    threadId: m.conversationId ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    fromEmail: m.from?.emailAddress?.address?.toLowerCase() ?? null,
    to: (m.toRecipients ?? []).map((t) => t.emailAddress?.address?.toLowerCase()).filter(Boolean) as string[],
    subject: m.subject || "(no subject)",
    snippet: m.bodyPreview ?? "",
    receivedAt: m.receivedDateTime,
    isUnread: !m.isRead,
    isImportant: m.importance === "high" || m.flag?.flagStatus === "flagged" || m.inferenceClassification === "focused",
  }));
}

export async function microsoftMessageBody(token: string, id: string) {
  const r = await providerFetch(token, `${GRAPH}/messages/${encodeURIComponent(id)}?$select=body`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  const content: string = r.body?.content ?? "";
  return (r.body?.contentType === "html" ? htmlToText(content) : content).slice(0, 50_000);
}

export async function microsoftCreateDraft(token: string, d: DraftInput): Promise<string> {
  if (d.replyToProviderId) {
    const reply = await providerFetch(token, `${GRAPH}/messages/${encodeURIComponent(d.replyToProviderId)}/createReply`, { method: "POST", body: "{}" });
    await providerFetch(token, `${GRAPH}/messages/${reply.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        subject: d.subject,
        body: { contentType: "Text", content: d.body },
        toRecipients: d.to.map((a) => ({ emailAddress: { address: a } })),
      }),
    });
    return reply.id as string;
  }
  const r = await providerFetch(token, `${GRAPH}/messages`, {
    method: "POST",
    body: JSON.stringify({
      subject: d.subject,
      body: { contentType: "Text", content: d.body },
      toRecipients: d.to.map((a) => ({ emailAddress: { address: a } })),
    }),
  });
  return r.id as string;
}

export async function microsoftSendDraft(token: string, draftId: string) {
  await providerFetch(token, `${GRAPH}/messages/${encodeURIComponent(draftId)}/send`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
type GraphEvent = {
  id: string; changeKey?: string; subject?: string; bodyPreview?: string; isAllDay?: boolean; isCancelled?: boolean;
  location?: { displayName?: string }; start: { dateTime: string }; end: { dateTime: string }; seriesMasterId?: string;
};

export async function microsoftListEvents(token: string, from: Date, to: Date, tz: string): Promise<NormalizedEvent[]> {
  const out: NormalizedEvent[] = [];
  let url: string | null = `${GRAPH}/calendarView?${new URLSearchParams({
    startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "200",
    $select: "id,changeKey,subject,bodyPreview,isAllDay,isCancelled,location,start,end,seriesMasterId",
  })}`;
  let pages = 0;
  while (url && pages++ < 8) {
    const r = await providerFetch(token, url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    for (const e of (r.value ?? []) as GraphEvent[]) {
      const allDay = Boolean(e.isAllDay);
      const start = allDay ? startOfLocalDay(e.start.dateTime.slice(0, 10), tz) : new Date(e.start.dateTime + "Z");
      const end = allDay ? startOfLocalDay(e.end.dateTime.slice(0, 10), tz) : new Date(e.end.dateTime + "Z");
      out.push({
        externalId: e.id, etag: e.changeKey ?? null, title: e.subject || "(no title)", description: e.bodyPreview ?? null,
        location: e.location?.displayName || null, start, end, allDay, cancelled: Boolean(e.isCancelled), seriesId: e.seriesMasterId ?? null,
      });
    }
    url = r["@odata.nextLink"] ?? null;
  }
  return out;
}

const DAY_MAP: Record<string, string> = { MO: "monday", TU: "tuesday", WE: "wednesday", TH: "thursday", FR: "friday", SA: "saturday", SU: "sunday" };

/** Converts our simple RRULEs to a Graph patternedRecurrence. */
function toGraphRecurrence(rule: string, start: Date, tz: string) {
  const r = parseSimpleRule(rule);
  const startDate = formatInTimeZone(start, tz, "yyyy-MM-dd");
  const dow = DAY_MAP[["SU", "MO", "TU", "WE", "TH", "FR", "SA"][Number(formatInTimeZone(start, tz, "i")) % 7]];
  let pattern: Record<string, unknown>;
  switch (r.freq) {
    case "daily": pattern = { type: "daily", interval: r.interval }; break;
    case "weekdays": pattern = { type: "weekly", interval: 1, daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"] }; break;
    case "weekly": pattern = { type: "weekly", interval: r.interval, daysOfWeek: [dow] }; break;
    case "monthly": pattern = { type: "absoluteMonthly", interval: r.interval, dayOfMonth: Number(startDate.slice(8, 10)) }; break;
    case "yearly": pattern = { type: "absoluteYearly", interval: r.interval, dayOfMonth: Number(startDate.slice(8, 10)), month: Number(startDate.slice(5, 7)) }; break;
    default: return null;
  }
  const range = r.until
    ? { type: "endDate", startDate, endDate: r.until }
    : r.count ? { type: "numbered", startDate, numberOfOccurrences: r.count } : { type: "noEnd", startDate };
  return { pattern, range };
}

function toGraph(ev: OutgoingEvent) {
  const fmt = (d: Date) => (ev.allDay ? formatInTimeZone(d, ev.timezone, "yyyy-MM-dd'T'00:00:00") : d.toISOString().slice(0, 19));
  return {
    subject: ev.title,
    body: { contentType: "Text", content: ev.description ?? "" },
    location: { displayName: ev.location ?? "" },
    isAllDay: ev.allDay,
    start: { dateTime: fmt(ev.start), timeZone: ev.allDay ? ev.timezone : "UTC" },
    end: { dateTime: fmt(ev.end), timeZone: ev.allDay ? ev.timezone : "UTC" },
    recurrence: ev.recurrenceRule ? toGraphRecurrence(ev.recurrenceRule, ev.start, ev.timezone) : null,
  };
}

export async function microsoftUpsertEvent(token: string, ev: OutgoingEvent, externalId: string | null) {
  if (ev.cancelled && externalId) {
    await microsoftDeleteEvent(token, externalId);
    return { externalId, etag: null };
  }
  const r = externalId
    ? await providerFetch(token, `${GRAPH}/events/${encodeURIComponent(externalId)}`, { method: "PATCH", body: JSON.stringify(toGraph(ev)) })
    : await providerFetch(token, `${GRAPH}/events`, { method: "POST", body: JSON.stringify(toGraph(ev)) });
  return { externalId: r.id as string, etag: (r.changeKey as string) ?? null };
}

export async function microsoftDeleteEvent(token: string, externalId: string) {
  try {
    await providerFetch(token, `${GRAPH}/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
  } catch (e) {
    if (!/not found|ErrorItemNotFound|404/i.test((e as Error).message)) throw e;
  }
}
