import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth";
import { generateBriefing } from "@/lib/ai/briefing";

export async function POST() {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: allowed } = await u.supabase.rpc("check_rate_limit", { p_bucket: "briefing", p_limit: 10, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: "Briefing limit reached; try again later." }, { status: 429 });
  const b = await generateBriefing(u.supabase, u.user.id, u.profile?.timezone ?? "UTC", u.profile?.full_name ?? "there");
  return NextResponse.json(b);
}
