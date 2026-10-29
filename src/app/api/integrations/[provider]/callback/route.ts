import { NextResponse, type NextRequest } from "next/server";
import { getApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProvider, PROVIDERS, redirectUri } from "@/lib/integrations/providers";
import { exchangeToken, storeTokens } from "@/lib/integrations/tokens";
import { ops } from "@/lib/integrations";
import { syncMailAccount } from "@/lib/integrations/mail-sync";
import { syncCalendarAccount } from "@/lib/integrations/calendar-sync";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/integrations/[provider]/callback">) {
  const { provider } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/integrations?${q}`, req.url));
  if (!isProvider(provider)) return back("error=Unknown+provider");
  if (sp.get("error")) return back(`error=${encodeURIComponent(sp.get("error_description") ?? sp.get("error") ?? "Authorisation was cancelled")}`);

  const u = await getApiUser();
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return back("error=Missing+authorisation+code");

  const admin = createAdminClient();
  // Single-use state bound to the signed-in user and provider, valid for 15 minutes.
  const { data: st } = await admin.from("oauth_states").delete().eq("state", state).select("*").maybeSingle();
  if (!st || st.user_id !== u.user.id || st.provider !== provider || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) {
    return back("error=Authorisation+session+expired+or+invalid.+Please+try+again.");
  }

  try {
    const tokens = await exchangeToken(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(provider),
      code_verifier: st.code_verifier,
    });
    const profile = await ops.profile(provider, tokens.access_token);
    const granted = tokens.scope ? tokens.scope.split(" ") : [...PROVIDERS[provider].scopes];
    const { data: acc, error } = await admin.from("email_accounts").upsert({
      user_id: u.user.id,
      provider,
      email_address: profile.email,
      display_name: profile.name,
      scopes: granted,
      status: "connected",
      last_error: null,
    }, { onConflict: "user_id,provider,email_address" }).select("id").single();
    if (error) throw new Error(error.message);
    await storeTokens(acc.id, u.user.id, tokens);
    await u.supabase.rpc("log_audit", { p_action: "integration_connected", p_entity_type: "email_accounts", p_entity_id: acc.id, p_metadata: { provider, email: profile.email } });

    // Initial sync; failures are recorded on the account and shown in the UI.
    await Promise.allSettled([syncMailAccount(acc.id), syncCalendarAccount(acc.id)]);
    return back(`connected=${provider}`);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
