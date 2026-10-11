"use client";

/**
 * In-tab "data changed" signal.
 *
 * Mutating forms/dialogs call `notifyDataChanged(...)` after a successful
 * server action; list components subscribe with `useDataChanged(...)` and
 * refetch. This keeps the screen where the user acted in sync immediately,
 * without waiting for SSE (which doesn't cross Vercel instances) or the 30 s
 * polling fallback. Other devices still rely on realtime/polling.
 */

import { useEffect, useRef } from "react";

export type DataScope =
  | "tickets"
  | "appointments"
  | "products"
  | "editRequests"
  | "clothSales"
  | "businessDay"
  | "payouts"
  | "clients";

const EVENT = "befine:data-changed";

export function notifyDataChanged(...scopes: DataScope[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DataScope[]>(EVENT, { detail: scopes }));
}

export function useDataChanged(scopes: DataScope[], onChange: () => void): void {
  const onChangeRef = useRef(onChange);
  const key = scopes.join("|");

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const wanted = new Set(key.split("|"));
    function handler(e: Event) {
      const changed = (e as CustomEvent<DataScope[]>).detail ?? [];
      if (changed.some((s) => wanted.has(s))) onChangeRef.current();
    }
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [key]);
}
