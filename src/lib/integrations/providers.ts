import "server-only";
import { env } from "@/lib/env";

export type Provider = "google" | "microsoft";

/**
 * Minimum scopes for each provider. Read access to mail, permission to create
 * drafts (and send them only after explicit user confirmation), and calendar
 * read/write for two-way sync. No settings, contacts or delete scopes.
 */
export const PROVIDERS = {
  google: {
    label: "Google (Gmail & Google Calendar)",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    clientId: () => env.googleClientId(),
    clientSecret: () => env.googleClientSecret(),
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } as Record<string, string>,
  },
  microsoft: {
    label: "Microsoft (Outlook mail & calendar)",
    authUrl: `https://login.microsoftonline.com/${env.microsoftTenant()}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${env.microsoftTenant()}/oauth2/v2.0/token`,
    revokeUrl: null,
    scopes: ["openid", "email", "profile", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"],
    clientId: () => env.microsoftClientId(),
    clientSecret: () => env.microsoftClientSecret(),
    extraAuthParams: { response_mode: "query", prompt: "select_account" } as Record<string, string>,
  },
} as const;

export function redirectUri(provider: Provider) {
  return `${env.appUrl()}/api/integrations/${provider}/callback`;
}

export function isProvider(p: string): p is Provider {
  return p === "google" || p === "microsoft";
}
