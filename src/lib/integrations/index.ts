import "server-only";
import * as google from "@/lib/integrations/google";
import * as ms from "@/lib/integrations/microsoft";
import type { Provider } from "@/lib/integrations/providers";
import type { DraftInput, NormalizedEvent, NormalizedMessage, OutgoingEvent } from "@/lib/integrations/types";

/** Provider-agnostic operations. */
export const ops = {
  profile: (p: Provider, t: string) => (p === "google" ? google.googleProfile(t) : ms.microsoftProfile(t)),
  listMessages: (p: Provider, t: string): Promise<NormalizedMessage[]> =>
    p === "google" ? google.googleListMessages(t) : ms.microsoftListMessages(t),
  messageBody: (p: Provider, t: string, id: string) => (p === "google" ? google.googleMessageBody(t, id) : ms.microsoftMessageBody(t, id)),
  createDraft: (p: Provider, t: string, d: DraftInput) => (p === "google" ? google.googleCreateDraft(t, d) : ms.microsoftCreateDraft(t, d)),
  sendDraft: (p: Provider, t: string, id: string) => (p === "google" ? google.googleSendDraft(t, id) : ms.microsoftSendDraft(t, id)),
  listEvents: (p: Provider, t: string, from: Date, to: Date, tz: string): Promise<NormalizedEvent[]> =>
    p === "google" ? google.googleListEvents(t, from, to, tz) : ms.microsoftListEvents(t, from, to, tz),
  upsertEvent: (p: Provider, t: string, ev: OutgoingEvent, externalId: string | null) =>
    p === "google" ? google.googleUpsertEvent(t, ev, externalId) : ms.microsoftUpsertEvent(t, ev, externalId),
  deleteEvent: (p: Provider, t: string, externalId: string) =>
    p === "google" ? google.googleDeleteEvent(t, externalId) : ms.microsoftDeleteEvent(t, externalId),
};
