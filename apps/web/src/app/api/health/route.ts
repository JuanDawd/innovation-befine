import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/db";
import { checkPublicRateLimit, rateLimits } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await checkPublicRateLimit(rateLimits.publicHealth, req, "health");
  if (limited) return limited;

  const { ok, latencyMs } = await healthCheck();

  if (!ok) {
    return NextResponse.json({ status: "degraded", db: "unreachable", latencyMs }, { status: 503 });
  }

  return NextResponse.json({ status: "ok", db: "ok", latencyMs });
}
