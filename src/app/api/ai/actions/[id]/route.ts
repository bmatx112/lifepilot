import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { executeAiAction } from "@/lib/ai/execute";
import type { AiActionLog } from "@/lib/types";

/** Confirm or reject an AI-proposed action. Nothing is executed without this explicit call. */
export async function POST(req: Request, ctx: RouteContext<"/api/ai/actions/[id]">) {
  const { id } = await ctx.params;
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ decision: z.enum(["confirm", "reject"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data: log } = await u.supabase.from("ai_action_logs").select("*").eq("id", id).eq("user_id", u.user.id).single<AiActionLog>();
  if (!log) return NextResponse.json({ error: "Action not found" }, { status: 404 });
  if (log.status !== "proposed") return NextResponse.json({ error: `This action was already ${log.status}.` }, { status: 409 });
  if (Date.now() - new Date(log.created_at).getTime() > 24 * 3600_000) {
    await u.supabase.from("ai_action_logs").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: "This proposal expired. Ask the assistant again." }, { status: 410 });
  }
  if (body.data.decision === "reject") {
    await u.supabase.from("ai_action_logs").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ status: "rejected" });
  }
  // Claim the proposal first so a double-click can't execute it twice.
  const { data: claimed } = await u.supabase.from("ai_action_logs").update({ decided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "proposed").is("decided_at", null).select("id");
  if (!claimed?.length) return NextResponse.json({ error: "Already being processed" }, { status: 409 });

  const result = await executeAiAction(u.supabase, u.user.id, u.profile?.timezone ?? "UTC", log);
  await u.supabase.from("ai_action_logs").update({
    status: result.ok ? "executed" : "failed",
    result: result.ok ? { message: result.message ?? null, data: result.data ?? null, warnings: result.warnings ?? [] } : null,
    error: result.ok ? null : result.error,
  }).eq("id", id);
  return NextResponse.json(result.ok ? { status: "executed", message: result.message, warnings: result.warnings } : { status: "failed", error: result.error }, { status: result.ok ? 200 : 422 });
}
