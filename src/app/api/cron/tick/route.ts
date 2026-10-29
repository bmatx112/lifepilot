import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTick } from "@/lib/reminders/dispatcher";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = env.cronSecret();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduler entry point. Call every 1–5 minutes from Vercel Cron, Supabase
 * pg_cron + pg_net, or any external scheduler with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  try {
    const result = await runTick(createAdminClient(), { sync: url.searchParams.get("sync") !== "0" });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("cron tick failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
