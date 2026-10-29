import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { PROVIDERS, type Provider } from "@/lib/integrations/providers";

export class IntegrationError extends Error {
  constructor(message: string, public readonly needsReconnect = false) {
    super(message);
  }
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
}

export async function storeTokens(accountId: string, userId: string, t: TokenSet) {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    account_id: accountId,
    user_id: userId,
    access_token_enc: encryptSecret(t.access_token),
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Providers only return a refresh token on first consent; keep the old one otherwise.
  if (t.refresh_token) row.refresh_token_enc = encryptSecret(t.refresh_token);
  const { error } = await admin.from("email_account_tokens").upsert(row, { onConflict: "account_id" });
  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
}

export async function exchangeToken(provider: Provider, params: Record<string, string>): Promise<TokenSet> {
  const cfg = PROVIDERS[provider];
  const body = new URLSearchParams({ client_id: cfg.clientId()!, client_secret: cfg.clientSecret()!, ...params });
  if (provider === "microsoft") body.set("scope", cfg.scopes.join(" "));
  const res = await fetch(cfg.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: string; error_description?: string });
    throw new IntegrationError(err.error_description ?? err.error ?? `Token endpoint returned ${res.status}`, err.error === "invalid_grant");
  }
  return json as TokenSet;
}

/** Returns a valid access token for an account, refreshing (and persisting) it when needed. */
export async function getAccessToken(accountId: string): Promise<{ token: string; provider: Provider; userId: string }> {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("email_accounts").select("id, user_id, provider, status").eq("id", accountId).single();
  if (!acc) throw new IntegrationError("Account not found");
  const { data: tok } = await admin.from("email_account_tokens").select("*").eq("account_id", accountId).single();
  if (!tok) throw new IntegrationError("No stored credentials — please reconnect", true);

  const expiresAt = tok.expires_at ? new Date(tok.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return { token: decryptSecret(tok.access_token_enc), provider: acc.provider, userId: acc.user_id };

  if (!tok.refresh_token_enc) {
    await markAccountError(accountId, "Access expired and no refresh token is available. Please reconnect.");
    throw new IntegrationError("Access expired — please reconnect", true);
  }
  try {
    const fresh = await exchangeToken(acc.provider, { grant_type: "refresh_token", refresh_token: decryptSecret(tok.refresh_token_enc) });
    await storeTokens(accountId, acc.user_id, fresh);
    if (acc.status !== "connected") await admin.from("email_accounts").update({ status: "connected", last_error: null }).eq("id", accountId);
    return { token: fresh.access_token, provider: acc.provider, userId: acc.user_id };
  } catch (e) {
    const err = e as IntegrationError;
    await markAccountError(accountId, err.needsReconnect ? "Authorisation was revoked or expired. Please reconnect." : err.message);
    throw err;
  }
}

export async function markAccountError(accountId: string, message: string) {
  await createAdminClient().from("email_accounts").update({ status: "error", last_error: message.slice(0, 500) }).eq("id", accountId);
}

/** fetch() wrapper for provider APIs with auth header and readable errors. */
export async function providerFetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : null;
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
    throw new IntegrationError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status === 401);
  }
  return json;
}
