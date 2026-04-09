"use client";

/**
 * useSSE — thin wrapper around the browser EventSource API — T009
 *
 * Handles:
 * - Connection lifecycle (open, error, close)
 * - Automatic reconnection (built into EventSource — no extra code needed)
 * - Cleanup on unmount
 *
 * Production use is via the packages/realtime abstraction (T098).
 * This hook is the underlying primitive that abstraction will use.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

type SSEOptions = {
  /** Called when a named event is received */
  onEvent?: (event: string, data: unknown, lastEventId: string) => void;
  /** Called when the connection opens */
  onOpen?: () => void;
  /** Called on connection error (EventSource retries automatically) */
  onError?: (event: Event) => void;
  /** Whether the hook should connect (default: true) */
  enabled?: boolean;
};

export function useSSE(url: string, options: SSEOptions = {}) {
  const { onEvent, onOpen, onError, enabled = true } = options;
  const esRef = useRef<EventSource | null>(null);

  // Stable refs updated synchronously after paint so effects always see latest callbacks
  const onEventRef = useRef(onEvent);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);

  useLayoutEffect(() => {
    onEventRef.current = onEvent;
    onOpenRef.current = onOpen;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => onOpenRef.current?.();
    es.onerror = (e) => onErrorRef.current?.(e);

    const handleNamedEvent = (eventName: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as unknown;
        onEventRef.current?.(eventName, data, e.lastEventId);
      } catch {
        onEventRef.current?.(eventName, e.data, e.lastEventId);
      }
    };

    // Listen to the common event names used in this app (extended in T098)
    const knownEvents = ["connected", "tick", "ticket_updated", "piece_assigned"];
    const handlers = knownEvents.map((name) => {
      const handler = handleNamedEvent(name);
      es.addEventListener(name, handler as EventListener);
      return { name, handler };
    });

    return () => {
      handlers.forEach(({ name, handler }) => {
        es.removeEventListener(name, handler as EventListener);
      });
      es.close();
      esRef.current = null;
    };
  }, [url, enabled]);

  return {
    /** Manually close the connection */
    close: () => esRef.current?.close(),
  };
}
