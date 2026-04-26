/**
 * Server-side realtime transport — T098
 *
 * Architecture: in-process EventEmitter.
 *
 * In development (single Next.js process), publishEvent() and the SSE route
 * handler share the same process, so events flow correctly.
 *
 * In production on Vercel (serverless), each request runs in an isolated
 * function instance. publishEvent() called from a Server Action will NOT reach
 * an SSE handler in a different instance. The client's 30-second polling
 * fallback (useRealtimeEvent) handles this gap — the SSE transport is a
 * latency optimisation, not the reliability layer.
 *
 * To upgrade to multi-instance production: replace the EventEmitter with
 * Postgres NOTIFY/LISTEN (requires a persistent connection via pg/neon-ws)
 * or Upstash Redis pub/sub. Changes are isolated to this file only.
 */

import { EventEmitter } from "events";
import type { RealtimeChannel, RealtimeEvent } from "./types";

// Survive HMR module re-evaluation in dev by persisting on globalThis.
// In production this is just a plain singleton (no global needed).
const g = globalThis as typeof globalThis & { __realtimeBus?: EventEmitter };
if (!g.__realtimeBus) {
  g.__realtimeBus = new EventEmitter();
  // Allow up to 50 concurrent SSE connections × 5 event types each
  g.__realtimeBus.setMaxListeners(300);
}
const bus = g.__realtimeBus;

const STREAM_TIMEOUT_MS = 25_000; // close before Vercel's 30s function timeout

/**
 * Publish an event to all SSE subscribers on this channel.
 * Call this from Server Actions after mutating state.
 *
 * @example
 *   await publishEvent("cashier", "ticket_updated", { ticketId, status: "awaiting_payment" });
 */
export function publishEvent<E extends RealtimeEvent>(
  channel: RealtimeChannel,
  event: E,
  data: unknown,
): void {
  bus.emit(`${channel}:${event}`, data);
}

/**
 * Create an SSE Response for a given channel.
 * Mount this in a Route Handler at `/api/realtime/[channel]/route.ts`.
 */
export function createSSEHandler(channel: RealtimeChannel): Response {
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        const idLine = id ? `id: ${id}\n` : "";
        controller.enqueue(
          new TextEncoder().encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Announce connection
      send("connected", { channel, timestamp: Date.now() });

      // Forward all events on this channel to the stream
      const forwardEvent = (event: RealtimeEvent) => (data: unknown) => {
        try {
          send(event, data, String(Date.now()));
        } catch {
          // Stream already closed — listener will be removed by cleanup
        }
      };

      const knownEvents: RealtimeEvent[] = [
        "ticket_updated",
        "ticket_created",
        "piece_assigned",
        "piece_updated",
        "connected",
      ];

      const listeners = knownEvents.map((event) => {
        const key = `${channel}:${event}`;
        const fn = forwardEvent(event);
        bus.on(key, fn);
        return { key, fn };
      });

      // Close the stream before the Vercel function timeout.
      // The client EventSource reconnects automatically.
      const timer = setTimeout(() => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, STREAM_TIMEOUT_MS);

      cleanup = () => {
        clearTimeout(timer);
        listeners.forEach(({ key, fn }) => bus.off(key, fn));
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Create an SSE Response scoped to a single employee.
 * Used for the `notifications` channel — only forwards events whose
 * `recipientEmployeeId` matches the connected employee (T04R-R1).
 */
export function createScopedSSEHandler(channel: "notifications", employeeId: string): Response {
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        const idLine = id ? `id: ${id}\n` : "";
        controller.enqueue(
          new TextEncoder().encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("connected", { channel, timestamp: Date.now() });

      const forwardIfRecipient = (data: unknown) => {
        if (
          data &&
          typeof data === "object" &&
          "recipientEmployeeId" in data &&
          (data as { recipientEmployeeId: string }).recipientEmployeeId === employeeId
        ) {
          try {
            send("notification_created", data, String(Date.now()));
          } catch {
            // stream already closed
          }
        }
      };

      const key = `${channel}:notification_created`;
      bus.on(key, forwardIfRecipient);

      const timer = setTimeout(() => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, STREAM_TIMEOUT_MS);

      cleanup = () => {
        clearTimeout(timer);
        bus.off(key, forwardIfRecipient);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
