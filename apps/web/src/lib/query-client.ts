import { QueryClient, isServer } from "@tanstack/react-query";

/**
 * TanStack Query client — server state cache for client components.
 *
 * - staleTime 30 s: reopening a dialog reuses recent catalog/ticket data
 *   instead of re-running server actions (which Next.js executes one at a
 *   time per tab, see M-64).
 * - Mutations invalidate by scope via `notifyDataChanged` (lib/data-events.ts).
 * - Realtime events invalidate via `RealtimeQueryBridge`.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // Server: always a fresh client so data never leaks between requests.
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
