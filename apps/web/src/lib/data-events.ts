"use client";

/**
 * Mutation → query invalidation.
 *
 * Mutating forms/dialogs call `notifyDataChanged(...)` after a successful
 * server action. It invalidates every TanStack query whose key starts with
 * one of the scopes (see lib/query-keys.ts), so every list on screen refetches
 * immediately — without waiting for SSE (which doesn't cross Vercel
 * instances) or the refetch interval. Other devices are updated by
 * `RealtimeQueryBridge` and `refetchInterval`.
 */

import { getQueryClient } from "@/lib/query-client";

export type DataScope =
  | "tickets"
  | "appointments"
  | "products"
  | "editRequests"
  | "clothSales"
  | "businessDay"
  | "payouts"
  | "clients"
  | "catalog"
  | "staff"
  | "pedidos";

export function notifyDataChanged(...scopes: DataScope[]): void {
  if (typeof window === "undefined") return;
  const queryClient = getQueryClient();
  for (const scope of scopes) void queryClient.invalidateQueries({ queryKey: [scope] });
}
