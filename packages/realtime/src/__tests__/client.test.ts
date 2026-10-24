// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRealtimeChannel, useRealtimeEvent } from "../client";

// M-72 — client hooks over a fake EventSource.

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: (e: MessageEvent) => void) {
    this.listeners.get(name)?.delete(fn);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: string) {
    for (const fn of this.listeners.get(name) ?? []) fn(new MessageEvent(name, { data }));
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const last = () => FakeEventSource.instances.at(-1)!;

describe("useRealtimeEvent", () => {
  it("connects to the channel route and passes parsed JSON to onData", () => {
    const onData = vi.fn();
    renderHook(() => useRealtimeEvent("cashier", "ticket_updated", { onData }));
    expect(last().url).toBe("/api/realtime/cashier");
    last().emit("ticket_updated", '{"ticketId":"t1","status":"closed"}');
    expect(onData).toHaveBeenCalledWith({ ticketId: "t1", status: "closed" });
  });

  it("passes non-JSON data through as a string", () => {
    const onData = vi.fn();
    renderHook(() => useRealtimeEvent("cashier", "ticket_updated", { onData }));
    last().emit("ticket_updated", "plain");
    expect(onData).toHaveBeenCalledWith("plain");
  });

  it("polls every 30 s as the reliability layer, and stops on unmount", () => {
    const onPoll = vi.fn();
    const { unmount } = renderHook(() =>
      useRealtimeEvent("cashier", "ticket_updated", { onData: vi.fn(), onPoll }),
    );
    vi.advanceTimersByTime(30_000);
    expect(onPoll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onPoll).toHaveBeenCalledTimes(3);
    unmount();
    vi.advanceTimersByTime(60_000);
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("keeps a single poll timer when the stream errors repeatedly", () => {
    const onPoll = vi.fn();
    renderHook(() => useRealtimeEvent("cashier", "ticket_updated", { onData: vi.fn(), onPoll }));
    last().onerror?.();
    last().onerror?.();
    vi.advanceTimersByTime(30_000);
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("uses the latest callbacks without reconnecting", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useRealtimeEvent("cashier", "ticket_updated", { onData: cb }),
      { initialProps: { cb: first } },
    );
    rerender({ cb: second });
    expect(FakeEventSource.instances).toHaveLength(1);
    last().emit("ticket_updated", "{}");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({});
  });

  it("closes the stream on unmount and doesn't connect while disabled", () => {
    const { unmount } = renderHook(() =>
      useRealtimeEvent("cashier", "ticket_updated", { onData: vi.fn() }),
    );
    const es = last();
    unmount();
    expect(es.closed).toBe(true);
    expect(es.listenerCount()).toBe(0);

    renderHook(() =>
      useRealtimeEvent("cashier", "ticket_updated", { onData: vi.fn(), enabled: false }),
    );
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});

describe("useRealtimeChannel", () => {
  it("one EventSource for several events, each delivered with its name", () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeChannel("clothier", ["piece_assigned", "piece_updated"], onEvent));
    expect(FakeEventSource.instances).toHaveLength(1);
    last().emit("piece_assigned", '{"pieceId":"p1"}');
    last().emit("piece_updated", "raw");
    expect(onEvent.mock.calls).toEqual([
      ["piece_assigned", { pieceId: "p1" }],
      ["piece_updated", "raw"],
    ]);
  });

  it("cleans up on unmount and stays idle while disabled", () => {
    const { unmount } = renderHook(() =>
      useRealtimeChannel("cashier", ["ticket_created"], vi.fn()),
    );
    const es = last();
    unmount();
    expect(es.closed).toBe(true);
    expect(es.listenerCount()).toBe(0);
    renderHook(() => useRealtimeChannel("cashier", ["ticket_created"], vi.fn(), false));
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
