import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";

const subSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(8).max(200) }),
});

export async function POST(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  // An endpoint belongs to one browser; replace any previous owner's row for it.
  await u.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await u.supabase.from("push_subscriptions").insert({
    user_id: u.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This browser is registered to another account." : error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.endpoint === "string") await u.supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", u.user.id);
  return NextResponse.json({ ok: true });
}
