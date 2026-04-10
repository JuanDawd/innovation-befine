/**
 * SSE route handler for all realtime channels — T098
 *
 * Mounts at /api/realtime/:channel (e.g. /api/realtime/cashier)
 * Used by useRealtimeEvent() hook internally — never call this directly.
 */
export const dynamic = "force-dynamic";

import { createSSEHandler } from "@befine/realtime/server";
import type { RealtimeChannel } from "@befine/realtime/types";

const VALID_CHANNELS: RealtimeChannel[] = ["cashier", "clothier"];

export async function GET(_req: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;

  if (!VALID_CHANNELS.includes(channel as RealtimeChannel)) {
    return new Response("Unknown channel", { status: 404 });
  }

  return createSSEHandler(channel as RealtimeChannel);
}
