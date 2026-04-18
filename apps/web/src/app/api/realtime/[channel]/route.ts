/**
 * SSE route handler for all realtime channels — T098, T04R-R1
 *
 * Mounts at /api/realtime/:channel (e.g. /api/realtime/cashier)
 * Used by useRealtimeEvent() hook internally — never call this directly.
 *
 * Auth gates (T04R-R1):
 *   cashier       → cashier_admin only
 *   clothier      → clothier only
 *   notifications → any authenticated employee; events scoped to caller's employee_id
 */
export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees } from "@befine/db/schema";
import { eq } from "drizzle-orm";
import { createSSEHandler, createScopedSSEHandler } from "@befine/realtime/server";
import type { RealtimeChannel } from "@befine/realtime/types";
import { hasRole } from "@/lib/middleware-helpers";
import type { AppRole } from "@befine/types";

const VALID_CHANNELS: RealtimeChannel[] = ["cashier", "clothier", "notifications"];

const CHANNEL_ROLES: Record<RealtimeChannel, AppRole[]> = {
  cashier: ["cashier_admin"],
  clothier: ["clothier"],
  notifications: ["cashier_admin", "secretary", "stylist", "clothier"],
};

export async function GET(req: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;

  if (!VALID_CHANNELS.includes(channel as RealtimeChannel)) {
    return new Response("Unknown channel", { status: 404 });
  }

  const ch = channel as RealtimeChannel;

  // Auth gate — require a valid session
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Role gate — check the caller has access to this channel
  const allowedRoles = CHANNEL_ROLES[ch];
  if (!hasRole(session.user, ...allowedRoles)) {
    return new Response("Forbidden", { status: 403 });
  }

  // For the notifications channel: scope events to the caller's employee_id
  if (ch === "notifications") {
    const db = getDb();
    const [emp] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, session.user.id))
      .limit(1);

    if (!emp) {
      return new Response("Employee not found", { status: 403 });
    }

    return createScopedSSEHandler("notifications", emp.id);
  }

  return createSSEHandler(ch);
}
