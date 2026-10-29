export interface NormalizedMessage {
  providerId: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  to: string[];
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  isImportant: boolean;
}

export interface NormalizedEvent {
  externalId: string;
  etag: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  cancelled: boolean;
  /** Set for instances of a recurring series. */
  seriesId: string | null;
}

export interface OutgoingEvent {
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  cancelled: boolean;
}

export interface DraftInput {
  to: string[];
  subject: string;
  body: string;
  /** Provider id of the message being replied to, for threading. */
  replyToProviderId?: string | null;
  threadId?: string | null;
}
