"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { PROVIDERS } from "@/lib/integrations/providers";
import { syncMailAccount } from "@/lib/integrations/mail-sync";
import { syncCalendarAccount } from "@/lib/integrations/calendar-sync";
import type { ActionResult } from "@/lib/types";

async function ownAccount(id: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("email_accounts").select("*").eq("id", id).eq("user_id", user.id).single();
  return { supabase, user, account: data };
}

export async function syncAccountNow(id: string): Promise<ActionResult> {
  const { supabase, account } = await ownAccount(id);
  if (!account) return { ok: false, error: "Account not found" };
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_bucket: "manual_sync", p_limit: 6, p_window_seconds: 300 });
  if (allowed === false) return { ok: false, error: "Please wait a few minutes before syncing again." };
  const results = await Promise.allSettled([syncMailAccount(id), syncCalendarAccount(id)]);
  revalidatePath("/", "layout");
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) return { ok: false, error: `Sync problem: ${(failed[0].reason as Error).message}` };
  const mail = results[0].status === "fulfilled" ? results[0].value : null;
  const cal = results[1].status === "fulfilled" ? results[1].value : null;
  return { ok: true, message: `Synced: ${mail?.inserted ?? 0} new email(s), ${cal?.pulled ?? 0} calendar change(s)` };
}

export async function updateAccountSync(id: string, patch: { mail_sync_enabled?: boolean; calendar_sync_enabled?: boolean }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("email_accounts").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Sync settings updated" };
}

/** Revokes the provider grant (where supported) and removes the account, its tokens and synced mail. */
export async function disconnectAccount(id: string): Promise<ActionResult> {
  const { supabase, user, account } = await ownAccount(id);
  if (!account) return { ok: false, error: "Account not found" };
  const admin = createAdminClient();
  const { data: tok } = await admin.from("email_account_tokens").select("refresh_token_enc, access_token_enc").eq("account_id", id).single();
  const revokeUrl = PROVIDERS[account.provider as "google" | "microsoft"].revokeUrl;
  if (tok && revokeUrl) {
    try {
      const t = decryptSecret(tok.refresh_token_enc ?? tok.access_token_enc);
      await fetch(`${revokeUrl}?token=${encodeURIComponent(t)}`, { method: "POST" });
    } catch (e) {
      console.error("revoke failed", e);
    }
  }
  // Synced provider events are removed; local events stay.
  await supabase.from("calendar_events").delete().eq("user_id", user.id).eq("email_account_id", id).eq("source", "sync");
  const { error } = await supabase.from("email_accounts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  await supabase.rpc("log_audit", { p_action: "integration_disconnected", p_entity_type: "email_accounts", p_entity_id: id, p_metadata: { provider: account.provider } });
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: account.provider === "microsoft"
      ? "Disconnected. To fully remove access, also remove LifePilot at myapps.microsoft.com."
      : "Disconnected and access revoked.",
  };
}
