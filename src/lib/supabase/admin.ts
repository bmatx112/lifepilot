import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES RLS — only use in trusted server code (cron jobs,
 * OAuth token storage, account deletion) and always scope queries by user_id.
 */
export function createAdminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl(), env.serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
