import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { features } from "@/lib/env";

/** Permanently deletes the account: storage files, then the auth user (all rows cascade). */
export async function POST(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ confirm: z.string() }).safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.confirm.trim().toLowerCase() !== (u.user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Type your account email exactly to confirm." }, { status: 400 });
  }
  if (!features.serviceRole()) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
  const admin = createAdminClient();
  // Remove uploaded files under the user's folder.
  const { data: files } = await admin.from("attachments").select("storage_path").eq("user_id", u.user.id);
  const paths = (files ?? []).map((f) => f.storage_path);
  for (let i = 0; i < paths.length; i += 100) await admin.storage.from("attachments").remove(paths.slice(i, i + 100));
  const { error } = await admin.auth.admin.deleteUser(u.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await u.supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json({ ok: true });
}
