"use client";

/**
 * Bridges server-sent realtime events into TanStack Query invalidations.
 *
 * Mounted once in the app shell, it opens ONE EventSource per allowed channel
 * (previously every list opened its own — 5 on the cashier page, M-64) and
 * invalidates the affected query scopes. Lists poll via `refetchInterval`, so
 * roles without channel access (secretary) still stay current.
 */

import { useQueryClient } from "@tanstack/react-query";
import type { AppRole } from "@befine/types";
import { useRealtimeChannel } from "@befine/realtime/client";

const CASHIER_EVENTS = ["ticket_created", "ticket_updated"] as const;

export function RealtimeQueryBridge({ role }: { role: AppRole }) {
  const queryClient = useQueryClient();
  const canReadCashier = role === "cashier" || role === "admin";

  useRealtimeChannel(
    "cashier",
    CASHIER_EVENTS,
    () => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["editRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["businessDay"] });
    },
    canReadCashier,
  );

  return null;
}
