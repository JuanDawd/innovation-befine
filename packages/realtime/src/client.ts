"use client";

/**
 * Client-side realtime hook — T098
 *
 * Wraps EventSource with:
 * - Named event subscription (no raw EventSource in consuming code)
 * - 30-second polling fallback that activates when SSE fails
 * - Cleanup on unmount
 */

import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel, RealtimeEvent } from "./types";

const SSE_BASE = "/api/realtime";
const POLLING_INTERVAL_MS = 30_000;

type UseRealtimeEventOptions = {
  /** Called with the parsed event data when the event fires */
  onData: (data: unknown) => void;
  /**
   * Polling fallback — called every 30s if SSE is down.
   * Should fetch the latest state from a REST endpoint.
   * Omitting this disables the polling fallback.
   */
  onPoll?: () => void | Promise<void>;
  /** Whether to connect (default: true). Set false to pause. */
  enabled?: boolean;
};

/**
 * Subscribe to a named realtime event on a channel.
 *
 * @example
 *   useRealtimeEvent("cashier", "ticket_updated", {
 *     onData: (data) => updateTicket(data as TicketUpdatedPayload),
 *     onPoll:  () => refetchTickets(),
 *   });
 */
export function useRealtimeEvent(
  channel: RealtimeChannel,
  event: RealtimeEvent,
  options: UseRealtimeEventOptions,
) {
  const { onData, onPoll, enabled = true } = options;

  const onDataRef = useRef(onData);
  const onPollRef = useRef(onPoll);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseFailedRef = useRef(false);

  useEffect(() => {
    onDataRef.current = onData;
    onPollRef.current = onPoll;
  });

  // Polling fallback — runs regardless of SSE state so it also covers the
  // multi-instance production gap (see packages/realtime/src/server.ts).
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      onPollRef.current?.();
    }, POLLING_INTERVAL_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      stopPolling();
      return;
    }

    const url = `${SSE_BASE}/${channel}`;
    const es = new EventSource(url);
    esRef.current = es;
    sseFailedRef.current = false;

    es.onopen = () => {
      sseFailedRef.current = false;
      // SSE is healthy — polling still runs as a backup, not disabled
    };

    es.onerror = () => {
      sseFailedRef.current = true;
      // EventSource retries automatically — ensure polling is running as fallback
      startPolling();
    };

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as unknown;
        onDataRef.current(data);
      } catch {
        onDataRef.current(e.data);
      }
    };

    es.addEventListener(event, handler as EventListener);

    // Always start polling — it's the reliability layer regardless of SSE health
    startPolling();

    return () => {
      es.removeEventListener(event, handler as EventListener);
      es.close();
      esRef.current = null;
      stopPolling();
    };
  }, [channel, event, enabled, startPolling, stopPolling]);
}
