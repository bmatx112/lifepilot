import { NextResponse, type NextRequest } from "next/server";
import { getApiUser } from "@/lib/auth";
import { features } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomToken, sha256base64url } from "@/lib/crypto";
import { isProvider, PROVIDERS, redirectUri } from "@/lib/integrations/providers";

/** Starts the OAuth authorisation-code flow with PKCE and a single-use state. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/integrations/[provider]/connect">) {
  const { provider } = await ctx.params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent(msg)}`, req.url));
  if (!isProvider(provider)) return back("Unknown provider");
  const u = await getApiUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  if (!(provider === "google" ? features.google() : features.microsoft())) {
    return back(`${provider === "google" ? "Google" : "Microsoft"} integration is not configured on the server.`);
  }
  const { data: ok } = await u.supabase.rpc("check_rate_limit", { p_bucket: "oauth_connect", p_limit: 10, p_window_seconds: 600 });
  if (ok === false) return back("Too many attempts — try again in a few minutes.");

  const state = randomToken(24);
  const verifier = randomToken(48);
  const admin = createAdminClient();
  // Clean up stale states, then store this one.
  await admin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { error } = await admin.from("oauth_states").insert({ state, user_id: u.user.id, provider, code_verifier: verifier });
  if (error) return back("Could not start authorisation");

  const cfg = PROVIDERS[provider];
  const url = new URL(cfg.authUrl);
  url.search = new URLSearchParams({
    client_id: cfg.clientId()!,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    code_challenge: sha256base64url(verifier),
    code_challenge_method: "S256",
    login_hint: u.user.email ?? "",
    ...cfg.extraAuthParams,
  }).toString();
  return NextResponse.redirect(url);
}
