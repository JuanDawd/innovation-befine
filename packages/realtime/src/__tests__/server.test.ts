import { describe, it, expect, vi, afterEach } from "vitest";
import type { EventEmitter } from "events";
import { createScopedSSEHandler, createSSEHandler, publishEvent } from "../server";

// M-72 — the in-process SSE transport.

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

  it("closes after 25 s and removes its listeners (no leak on reconnect)", async () => {
    vi.useFakeTimers();
    const before = listeners();
    const res = createSSEHandler("cashier");
    const reader = res.body!.getReader();
    await reader.read(); // "connected"
    expect(listeners()).toBeGreaterThan(before);
    vi.advanceTimersByTime(25_000);
    expect((await reader.read()).done).toBe(true);
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

  it("closes after 25 s and removes its listener", async () => {
    vi.useFakeTimers();
    const before = listeners();
    const res = createScopedSSEHandler("notifications", "emp-ana");
    const reader = res.body!.getReader();
    await reader.read();
    vi.advanceTimersByTime(25_000);
    expect((await reader.read()).done).toBe(true);
    expect(listeners()).toBe(before);
  });
});
