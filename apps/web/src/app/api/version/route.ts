import { NextResponse } from "next/server";
import { checkPublicRateLimit, rateLimits } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await checkPublicRateLimit(rateLimits.publicVersion, req, "version");
  if (limited) return limited;

  return NextResponse.json({
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  });
}
