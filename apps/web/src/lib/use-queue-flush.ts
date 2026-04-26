"use client";

/**
 * T079 — Queue flush hook
 *
 * Listens for online events and flushes the IndexedDB mutation queue
 * by calling the corresponding server actions with idempotency keys.
 * Also returns live queue state for the sync status UI (T080).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { listQueued, dequeue, markAttempted, type QueuedMutation } from "@/lib/mutation-queue";

export type FlushState = {
  pending: number;
  syncing: boolean;
  failed: number;
  retry: () => void;
};

// Dispatched actions — imported lazily to avoid SSR issues with server action imports
async function dispatchMutation(
  mutation: QueuedMutation,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (mutation.type === "markPieceDone") {
      const { markPieceDone } = await import("@/app/(protected)/clothier/actions");
      const p = mutation.payload as { pieceId: string; expectedVersion: number };
      const result = await markPieceDone(p.pieceId, p.expectedVersion, mutation.id);
      if (!result.success) return { success: false, error: result.error.message };
      return { success: true };
    }

    if (mutation.type === "createTicket") {
      const { createTicket } = await import("@/app/(protected)/tickets/actions");
      const result = await (
        createTicket as (
          payload: unknown,
        ) => Promise<{ success: boolean; error?: { message: string } }>
      )(mutation.payload);
      if (!result.success) return { success: false, error: result.error?.message };
      return { success: true };
    }

    if (mutation.type === "paidOffline") {
      const { processPaidOfflineCheckout } =
        await import("@/app/(protected)/cashier/checkout/actions");
      const result = await processPaidOfflineCheckout(mutation.payload);
      if (!result.success) return { success: false, error: result.error.message };
      return { success: true };
    }

    return { success: false, error: `Unknown mutation type: ${mutation.type}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export function useQueueFlush(): FlushState {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(0);
  const flushingRef = useRef(false);
  // T09R-R13: only flush when we transition offline→online, not on cold mount
  const wentOfflineRef = useRef(false);

  const refresh = useCallback(async () => {
    const items = await listQueued();
    setPending(items.length);
    setFailed(items.filter((i) => i.lastError !== null).length);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    setSyncing(true);

    try {
      const items = await listQueued();
      for (const mutation of items) {
        const result = await dispatchMutation(mutation);
        if (result.success) {
          await dequeue(mutation.id);
        } else {
          await markAttempted(mutation.id, result.error ?? "Unknown");
        }
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);

    const handleOffline = () => {
      wentOfflineRef.current = true;
    };

    const handleOnline = () => {
      if (wentOfflineRef.current) {
        wentOfflineRef.current = false;
        flush();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [flush, refresh]);

  return { pending, syncing, failed, retry: flush };
}
