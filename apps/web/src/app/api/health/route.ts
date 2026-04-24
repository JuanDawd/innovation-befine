import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { ok, latencyMs } = await healthCheck();

  if (!ok) {
    return NextResponse.json({ status: "degraded", db: "unreachable", latencyMs }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", db: "ok", latencyMs });
}
