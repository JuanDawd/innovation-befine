/**
 * Server-side realtime transport — T098, M-60
 *
 * Architecture: Postgres LISTEN/NOTIFY fanned out through an in-process EventEmitter.
 *
 * On Vercel the Server Action that publishes and the SSE handler that streams
 * usually run in different function instances, so an in-process bus alone
 * can't connect them. When a direct (non-pooled) Neon URL is available,
 * publishEvent() runs `pg_notify` and every instance with open SSE streams
 * holds ONE listening connection that re-emits notifications on its local bus.
 * The listener opens with the first stream and closes shortly after the last,
 * so an idle Neon compute can still suspend.
 *
 * Without such a URL (dev, tests, CI E2E against a local proxy) publishEvent()
 * emits on the local bus directly — single-process, same as before.
 *
 * The client's 30-second polling fallback (useRealtimeEvent) stays the
 * reliability layer; SSE is the latency optimisation.
 */

import { EventEmitter } from "events";
import { Client, neon } from "@neondatabase/serverless";
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

/** Close before the function's maxDuration (300 s with Fluid compute; the route sets it). */
export const STREAM_TIMEOUT_MS = 280_000;
/** SSE comment so proxies don't drop a quiet stream. */
const HEARTBEAT_MS = 25_000;
/** Keep the LISTEN connection this long after the last stream closes (reconnect gap). */
const LISTENER_IDLE_MS = 10_000;
const LISTENER_RETRY_MS = 2_000;
const PG_CHANNEL = "befine_realtime";
/** Postgres caps NOTIFY payloads at 8000 bytes. */
const MAX_PAYLOAD_BYTES = 7_900;

/**
 * Direct Neon URL for LISTEN/NOTIFY — LISTEN doesn't work through the pooler.
 * DATABASE_URL_UNPOOLED wins (Vercel's Neon integration name); otherwise a
 * Neon pooled DATABASE_URL is turned into its direct twin. Anything else
 * (localhost proxy, plain Postgres) means single-process mode.
 */
export function realtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.DATABASE_URL_UNPOOLED) return env.DATABASE_URL_UNPOOLED;
  const url = env.DATABASE_URL;
  return url?.includes("-pooler.") ? url.replace("-pooler.", ".") : null;
}

type Envelope = { key: string; data: unknown };

/**
 * Publish an event to all SSE subscribers on this channel, in every instance.
 * Call this from Server Actions after mutating state. Never rejects — a failed
 * NOTIFY falls back to the local bus and the clients' polling covers the rest.
 *
 * @example
 *   await publishEvent("cashier", "ticket_updated", { ticketId, status: "awaiting_payment" });
 */
export function publishEvent<E extends RealtimeEvent>(
  channel: RealtimeChannel,
  event: E,
  data: unknown,
): Promise<void> {
  const key = `${channel}:${event}`;
  const url = realtimeDatabaseUrl();
  const payload = JSON.stringify({ key, data } satisfies Envelope);
  if (!url || new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
    bus.emit(key, data);
    return Promise.resolve();
  }
  return neon(url)
    .query("SELECT pg_notify($1, $2)", [PG_CHANNEL, payload])
    .then(
      () => undefined,
      (err: unknown) => {
        console.error("[realtime] pg_notify failed; local delivery only", err);
        bus.emit(key, data);
      },
    );
}

// ─── Cross-instance listener ──────────────────────────────────────────────────

/** Minimal surface of the pg client — injectable for tests. */
export type ListenClient = {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "notification", fn: (msg: { channel: string; payload?: string }) => void): unknown;
  on(event: "error" | "end", fn: (err?: unknown) => void): unknown;
};

const state = globalThis as typeof globalThis & {
  __realtimeListener?: {
    client: ListenClient | null;
    subscribers: number;
    idleTimer?: ReturnType<typeof setTimeout>;
    retryTimer?: ReturnType<typeof setTimeout>;
    createClient: (url: string) => ListenClient;
  };
};
state.__realtimeListener ??= {
  client: null,
  subscribers: 0,
  createClient: (url) => new Client(url) as unknown as ListenClient,
};
const listener = state.__realtimeListener;

/** Test hook: swap the pg client factory and drop any listener state. */
export function setListenClientFactory(factory: (url: string) => ListenClient): void {
  clearTimeout(listener.idleTimer);
  clearTimeout(listener.retryTimer);
  listener.retryTimer = undefined;
  listener.client = null;
  listener.subscribers = 0;
  listener.createClient = factory;
}

function startListener(url: string): void {
  const client = listener.createClient(url);
  listener.client = client;

  const drop = (err?: unknown) => {
    if (listener.client !== client) return;
    if (err) console.error("[realtime] LISTEN connection lost", err);
    listener.client = null;
    client.end().catch(() => {});
    if (listener.subscribers > 0 && !listener.retryTimer) {
      listener.retryTimer = setTimeout(() => {
        listener.retryTimer = undefined;
        if (listener.subscribers > 0 && !listener.client) startListener(url);
      }, LISTENER_RETRY_MS);
    }
  };

  client.on("notification", (msg) => {
    if (msg.channel !== PG_CHANNEL || !msg.payload) return;
    try {
      const { key, data } = JSON.parse(msg.payload) as Envelope;
      if (typeof key === "string") bus.emit(key, data);
    } catch {
      /* not ours */
    }
  });
  client.on("error", drop);
  client.on("end", () => drop());
  client
    .connect()
    .then(() => client.query(`LISTEN ${PG_CHANNEL}`))
    .catch(drop);
}

/** Called when an SSE stream opens; returns the matching release(). */
function retainListener(): () => void {
  const url = realtimeDatabaseUrl();
  if (!url) return () => {};

  listener.subscribers += 1;
  clearTimeout(listener.idleTimer);
  if (!listener.client && !listener.retryTimer) startListener(url);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    listener.subscribers -= 1;
    if (listener.subscribers > 0) return;
    listener.idleTimer = setTimeout(() => {
      if (listener.subscribers > 0) return;
      clearTimeout(listener.retryTimer);
      listener.retryTimer = undefined;
      const client = listener.client;
      listener.client = null;
      client?.end().catch(() => {});
    }, LISTENER_IDLE_MS);
  };
}

// ─── SSE streams ──────────────────────────────────────────────────────────────

type Send = (event: string, data: unknown, id?: string) => void;

/**
 * Shared SSE plumbing: `connected` hello, heartbeat, timeout close, and
 * cleanup on both client disconnect (cancel) and server close (M-72).
 * `subscribe` attaches bus listeners and returns their teardown.
 */
function sseResponse(channel: RealtimeChannel, subscribe: (send: Send) => () => void): Response {
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send: Send = (event, data, id) => {
        const idLine = id ? `id: ${id}\n` : "";
        controller.enqueue(
          encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("connected", { channel, timestamp: Date.now() });

      const unsubscribe = subscribe(send);
      const release = retainListener();

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* already closed */
        }
      }, HEARTBEAT_MS);

      // Close before the function timeout; EventSource reconnects automatically.
      // M-72: closing from the server doesn't trigger cancel(), so clean up here too.
      const timer = setTimeout(() => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, STREAM_TIMEOUT_MS);

      cleanup = () => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        unsubscribe();
        release();
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
 * Create an SSE Response for a given channel.
 * Mount this in a Route Handler at `/api/realtime/[channel]/route.ts`.
 */
export function createSSEHandler(channel: RealtimeChannel): Response {
  return sseResponse(channel, (send) => {
    const knownEvents: RealtimeEvent[] = [
      "ticket_updated",
      "ticket_created",
      "piece_assigned",
      "piece_updated",
      "connected",
    ];
    const listeners = knownEvents.map((event) => {
      const key = `${channel}:${event}`;
      const fn = (data: unknown) => {
        try {
          send(event, data, String(Date.now()));
        } catch {
          // Stream already closed — listener will be removed by cleanup
        }
      };
      bus.on(key, fn);
      return { key, fn };
    });
    return () => listeners.forEach(({ key, fn }) => bus.off(key, fn));
  });
}

/**
 * Create an SSE Response scoped to a single employee.
 * Used for the `notifications` channel — only forwards events whose
 * `recipientEmployeeId` matches the connected employee (T04R-R1).
 */
export function createScopedSSEHandler(channel: "notifications", employeeId: string): Response {
  return sseResponse(channel, (send) => {
    const key = `${channel}:notification_created`;
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
    bus.on(key, forwardIfRecipient);
    return () => bus.off(key, forwardIfRecipient);
  });
}
