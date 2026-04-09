"use client";

/**
 * SSE spike test page — T009
 *
 * Visit /sse-test to verify the SSE connection works end-to-end.
 * Not linked from navigation — development/QA use only.
 */

import { useState } from "react";
import { useSSE } from "@/hooks/use-sse";

type TickEvent = { counter?: number; timestamp?: number; message?: string };

export default function SSETestPage() {
  const [events, setEvents] = useState<{ type: string; data: TickEvent; id: string }[]>([]);
  const [connected, setConnected] = useState(false);

  const { close } = useSSE("/api/sse/test", {
    onOpen: () => setConnected(true),
    onError: () => setConnected(false),
    onEvent: (eventName, data, lastEventId) => {
      setEvents((prev) => [
        { type: eventName, data: data as TickEvent, id: lastEventId },
        ...prev.slice(0, 29), // keep last 30
      ]);
    },
  });

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-2xl font-bold">SSE Spike — T009</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Status:{" "}
        <span className={connected ? "text-green-600" : "text-yellow-600"}>
          {connected ? "Connected" : "Connecting…"}
        </span>
      </p>
      <button onClick={close} className="mb-6 rounded border px-3 py-1 text-sm hover:bg-muted">
        Disconnect
      </button>
      <ul className="space-y-1 font-mono text-xs">
        {events.map((e, i) => (
          <li key={i} className="rounded bg-muted px-3 py-1">
            <span className="text-muted-foreground">[{e.type}]</span> {JSON.stringify(e.data)}
            {e.id && <span className="ml-2 text-muted-foreground">id={e.id}</span>}
          </li>
        ))}
        {events.length === 0 && <li className="text-muted-foreground">Waiting for events…</li>}
      </ul>
    </main>
  );
}
