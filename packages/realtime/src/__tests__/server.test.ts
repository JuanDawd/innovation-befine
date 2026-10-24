import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { EventEmitter } from "events";
import {
  STREAM_TIMEOUT_MS,
  createScopedSSEHandler,
  createSSEHandler,
  publishEvent,
  realtimeDatabaseUrl,
  setListenClientFactory,
  type ListenClient,
} from "../server";

// M-72 — the in-process SSE transport; M-60 — cross-instance LISTEN/NOTIFY.

const bus = (globalThis as typeof globalThis & { __realtimeBus: EventEmitter }).__realtimeBus;
const listeners = () => bus.eventNames().reduce((n, e) => n + bus.listenerCount(e), 0);

/** Reads SSE frames from a Response until `count` frames arrived. */
async function readFrames(res: Response, count: number): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (buffer.split("\n\n").filter(Boolean).length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
  }
  reader.releaseLock();
  return buffer.split("\n\n").filter(Boolean);
}

/** Drains the stream (heartbeat pings included) and reports whether it closed. */
async function closed(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
  for (let i = 0; i < 100; i++) if ((await reader.read()).done) return true;
  return false;
}

afterEach(() => {
  vi.useRealTimers();
  bus.removeAllListeners();
});

describe("createSSEHandler", () => {
  it("responds as an uncached event stream", () => {
    const res = createSSEHandler("cashier");
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    void res.body?.cancel();
  });

  it("announces the connection, then forwards events published on its channel", async () => {
    const res = createSSEHandler("cashier");
    const pending = readFrames(res, 2);
    publishEvent("cashier", "ticket_updated", { ticketId: "t1", status: "closed" });
    const [hello, update] = await pending;
    expect(hello).toMatch(/^event: connected\ndata: \{"channel":"cashier","timestamp":\d+\}$/);
    expect(update).toMatch(
      /^id: \d+\nevent: ticket_updated\ndata: \{"ticketId":"t1","status":"closed"\}$/,
    );
    await res.body?.cancel();
  });

  it("ignores events published on another channel", async () => {
    const res = createSSEHandler("clothier");
    const pending = readFrames(res, 2);
    publishEvent("cashier", "ticket_created", { ticketId: "t1" });
    publishEvent("clothier", "piece_updated", { pieceId: "p1", status: "approved" });
    const frames = await pending;
    expect(frames[1]).toContain("event: piece_updated");
    expect(frames.join()).not.toContain("ticket_created");
    await res.body?.cancel();
  });

  it("removes its bus listeners when the client disconnects", async () => {
    const before = listeners();
    const res = createSSEHandler("cashier");
    await readFrames(res, 1);
    expect(listeners()).toBeGreaterThan(before);
    await res.body?.cancel();
    expect(listeners()).toBe(before);
  });

  it("closes at the stream timeout and removes its listeners (no leak on reconnect)", async () => {
    vi.useFakeTimers();
    const before = listeners();
    const res = createSSEHandler("cashier");
    const reader = res.body!.getReader();
    await reader.read(); // "connected"
    expect(listeners()).toBeGreaterThan(before);
    vi.advanceTimersByTime(STREAM_TIMEOUT_MS);
    expect(await closed(reader)).toBe(true);
    expect(listeners()).toBe(before);
  });
});

describe("createScopedSSEHandler", () => {
  it("forwards a notification only to its recipient", async () => {
    const res = createScopedSSEHandler("notifications", "emp-ana");
    const pending = readFrames(res, 2);
    publishEvent("notifications", "notification_created", {
      notificationId: "n1",
      recipientEmployeeId: "emp-bea",
    });
    publishEvent("notifications", "notification_created", {
      notificationId: "n2",
      recipientEmployeeId: "emp-ana",
    });
    const frames = await pending;
    expect(frames[1]).toContain('"notificationId":"n2"');
    expect(frames.join()).not.toContain('"n1"');
    await res.body?.cancel();
  });

  it("ignores malformed payloads", async () => {
    const res = createScopedSSEHandler("notifications", "emp-ana");
    const pending = readFrames(res, 2);
    publishEvent("notifications", "notification_created", null);
    publishEvent("notifications", "notification_created", "emp-ana");
    publishEvent("notifications", "notification_created", {
      notificationId: "ok",
      recipientEmployeeId: "emp-ana",
    });
    const frames = await pending;
    expect(frames).toHaveLength(2);
    expect(frames[1]).toContain('"ok"');
    await res.body?.cancel();
  });

  it("closes at the stream timeout and removes its listener", async () => {
    vi.useFakeTimers();
    const before = listeners();
    const res = createScopedSSEHandler("notifications", "emp-ana");
    const reader = res.body!.getReader();
    await reader.read();
    vi.advanceTimersByTime(STREAM_TIMEOUT_MS);
    expect(await closed(reader)).toBe(true);
    expect(listeners()).toBe(before);
  });
});

describe("realtimeDatabaseUrl", () => {
  it("prefers DATABASE_URL_UNPOOLED", () => {
    expect(
      realtimeDatabaseUrl({
        DATABASE_URL_UNPOOLED: "postgres://u@ep-a.neon.tech/db",
        DATABASE_URL: "postgres://u@ep-b-pooler.neon.tech/db",
      }),
    ).toBe("postgres://u@ep-a.neon.tech/db");
  });

  it("derives the direct endpoint from a Neon pooled URL", () => {
    expect(
      realtimeDatabaseUrl({ DATABASE_URL: "postgres://u:p@ep-x-pooler.c-6.aws.neon.tech/db" }),
    ).toBe("postgres://u:p@ep-x.c-6.aws.neon.tech/db");
  });

  it("is null for a non-Neon URL or none — single-process mode", () => {
    expect(realtimeDatabaseUrl({ DATABASE_URL: "postgres://u@192.168.0.107:5432/main" })).toBe(
      null,
    );
    expect(realtimeDatabaseUrl({})).toBe(null);
  });
});

describe("cross-instance listener (LISTEN/NOTIFY)", () => {
  type Handlers = Record<string, ((arg?: unknown) => void)[]>;
  let clients: { handlers: Handlers; queries: string[]; ended: boolean }[];

  beforeEach(() => {
    clients = [];
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://u@ep-test.neon.tech/db");
    setListenClientFactory(() => {
      const c = { handlers: {} as Handlers, queries: [] as string[], ended: false };
      clients.push(c);
      const client = {
        connect: () => Promise.resolve(),
        query: (q: string) => {
          c.queries.push(q);
          return Promise.resolve();
        },
        end: () => {
          c.ended = true;
          return Promise.resolve();
        },
        on: (event: string, fn: (arg?: unknown) => void) => {
          (c.handlers[event] ??= []).push(fn);
          return client;
        },
      };
      return client as unknown as ListenClient;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const notify = (c: (typeof clients)[number], payload: unknown) =>
    c.handlers.notification?.forEach((fn) =>
      fn({ channel: "befine_realtime", payload: JSON.stringify(payload) }),
    );

  it("opens one LISTEN connection per instance, shared by all streams", async () => {
    const a = createSSEHandler("cashier");
    const b = createSSEHandler("cashier");
    await Promise.all([readFrames(a, 1), readFrames(b, 1)]);
    await vi.waitFor(() => expect(clients[0]?.queries).toEqual(["LISTEN befine_realtime"]));
    expect(clients).toHaveLength(1);
    await a.body?.cancel();
    await b.body?.cancel();
  });

  it("forwards a notification from another instance to the stream", async () => {
    const res = createSSEHandler("cashier");
    const pending = readFrames(res, 2);
    await vi.waitFor(() => expect(clients[0]?.queries).toHaveLength(1));
    notify(clients[0]!, {
      key: "cashier:ticket_updated",
      data: { ticketId: "t9", status: "closed" },
    });
    const frames = await pending;
    expect(frames[1]).toContain('"ticketId":"t9"');
    await res.body?.cancel();
  });

  it("ignores other channels and malformed payloads", async () => {
    const res = createSSEHandler("cashier");
    const pending = readFrames(res, 2);
    await vi.waitFor(() => expect(clients[0]?.queries).toHaveLength(1));
    clients[0]!.handlers.notification?.forEach((fn) => {
      fn({
        channel: "other",
        payload: JSON.stringify({ key: "cashier:ticket_created", data: {} }),
      });
      fn({ channel: "befine_realtime", payload: "not json" });
      fn({ channel: "befine_realtime" });
    });
    notify(clients[0]!, { key: "cashier:ticket_created", data: { ticketId: "ok" } });
    const frames = await pending;
    expect(frames[1]).toContain('"ticketId":"ok"');
    await res.body?.cancel();
  });

  it("closes the connection after the last stream goes idle", async () => {
    vi.useFakeTimers();
    const res = createSSEHandler("cashier");
    await res.body?.cancel();
    expect(clients[0]!.ended).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(clients[0]!.ended).toBe(true);
  });

  it("keeps the connection when a stream reconnects within the idle window", async () => {
    vi.useFakeTimers();
    const first = createSSEHandler("cashier");
    await first.body?.cancel();
    vi.advanceTimersByTime(5_000);
    const second = createSSEHandler("cashier");
    vi.advanceTimersByTime(10_000);
    expect(clients).toHaveLength(1);
    expect(clients[0]!.ended).toBe(false);
    await second.body?.cancel();
    vi.advanceTimersByTime(10_000);
  });

  it("reconnects after the connection drops while streams are open", async () => {
    vi.useFakeTimers();
    const res = createSSEHandler("cashier");
    clients[0]!.handlers.error?.forEach((fn) => fn(new Error("socket closed")));
    expect(clients[0]!.ended).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(clients).toHaveLength(2);
    await res.body?.cancel();
    vi.advanceTimersByTime(10_000);
  });

  it("falls back to the local bus when pg_notify fails", async () => {
    vi.stubEnv("DATABASE_URL_UNPOOLED", "postgres://u:p@127.0.0.1:1/none");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const received: unknown[] = [];
    bus.on("cashier:ticket_created", (d) => received.push(d));
    await publishEvent("cashier", "ticket_created", { ticketId: "local" });
    expect(received).toEqual([{ ticketId: "local" }]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
