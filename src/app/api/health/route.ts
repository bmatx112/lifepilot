import { NextResponse } from "next/server";
import { featureStatus } from "@/lib/env";

/** Reports which integrations are configured (booleans only, never secrets). */
export async function GET() {
  return NextResponse.json({ ok: true, features: featureStatus(), time: new Date().toISOString() });
}
