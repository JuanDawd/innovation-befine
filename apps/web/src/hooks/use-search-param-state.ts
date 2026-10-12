"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

/**
 * View state kept in the URL query string (filters, tabs, periods) so it
 * survives a refresh and can be shared as a link.
 *
 * Writes with `history.replaceState`, which Next.js syncs into
 * `useSearchParams` without a server round-trip or a new history entry.
 * The fallback value is not written — it is the clean URL.
 *
 * @param parse  Return the value if `raw` is valid, else null (→ fallback).
 */
export function useSearchParamState<T extends string>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null = (raw) => raw as T,
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const raw = searchParams.get(key);
  const value = (raw !== null ? parse(raw) : null) ?? fallback;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(window.location.search);
      if (next === fallback || next === "") params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
    [key, fallback],
  );

  return [value, setValue];
}

/** Parser helper: accept only one of the listed values. */
export function oneOf<T extends string>(values: readonly T[]) {
  return (raw: string): T | null =>
    (values as readonly string[]).includes(raw) ? (raw as T) : null;
}
