"use client";

/**
 * CashierDashboard — T036, T037
 *
 * Displays open tickets grouped by employee.
 * Server state via TanStack Query (`tickets.open`): realtime events and saves
 * invalidate it (RealtimeQueryBridge / notifyDataChanged); 30 s refetch backup.
 *
 * Cashier/admin can mark logged or reopened tickets as "awaiting payment"
 * directly from the card — T037.
 */

import { useState, useOptimistic, startTransition as reactStartTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "@/lib/action-query";
import { useTranslations } from "next-intl";
import { Loader2Icon, CreditCardIcon, TicketIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listOpenTickets,
  transitionToAwaitingPayment,
  transitionReopenedToAwaitingPayment,
  type DashboardTicket,
} from "@/app/(protected)/tickets/actions";
import { Button } from "@/components/ui/button";
import { optimisticStatusReducer } from "./cashier-dashboard-helpers";
import { formatMoney } from "@/i18n";

type TicketsByEmployee = Map<string, { employeeName: string; tickets: DashboardTicket[] }>;

function groupByEmployee(tickets: DashboardTicket[]): TicketsByEmployee {
  const map = new Map<string, { employeeName: string; tickets: DashboardTicket[] }>();
  for (const t of tickets) {
    if (!map.has(t.employeeId)) {
      map.set(t.employeeId, { employeeName: t.employeeName, tickets: [] });
    }
    map.get(t.employeeId)!.tickets.push(t);
  }
  return map;
}

function elapsed(date: Date): string {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

/** Highlight tickets created in the last 10 s (replaces the SSE-driven flash). */
function isJustCreated(ticket: DashboardTicket): boolean {
  return Date.now() - new Date(ticket.createdAt).getTime() < 10_000;
}

function statusClass(status: DashboardTicket["status"]): string {
  if (status === "awaiting_payment")
    return "border-l-4 border-l-status-attention-foreground bg-status-attention";
  if (status === "reopened")
    return "border-l-4 border-l-status-progress-foreground bg-status-progress";
  return "border-l-4 border-l-transparent";
}

export function CashierDashboard({ initialTickets }: { initialTickets: DashboardTicket[] }) {
  const ts = useTranslations("status");
  const tt = useTranslations("tickets");
  const { data: tickets = [] } = useQuery({
    queryKey: queryKeys.tickets.open,
    queryFn: () => unwrap(listOpenTickets()),
    initialData: initialTickets,
    refetchInterval: 30_000,
  });
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // T10R-R2 — optimistic status update; reverts naturally if the action errors
  // because the query data is only replaced on a successful refetch.
  const [optimisticTickets, applyOptimistic] = useOptimistic(tickets, optimisticStatusReducer);

  async function handleMarkReady(ticket: DashboardTicket) {
    setTransitioning((prev) => new Set(prev).add(ticket.id));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(ticket.id);
      return next;
    });

    // Optimistic flip — must run inside a transition per React 19 rules.
    reactStartTransition(() => {
      applyOptimistic({ id: ticket.id, status: "awaiting_payment" });
    });

    const action =
      ticket.status === "reopened"
        ? transitionReopenedToAwaitingPayment
        : transitionToAwaitingPayment;

    const result = await action({ ticketId: ticket.id });

    setTransitioning((prev) => {
      const next = new Set(prev);
      next.delete(ticket.id);
      return next;
    });

    if (!result.success) {
      // Failure path — surface the error; the optimistic state reverts
      // automatically when this transition completes without a setTickets call.
      setErrors((prev) => new Map(prev).set(ticket.id, tt("markReadyError")));
      return;
    }
    notifyDataChanged("tickets");
  }

  const byEmployee = groupByEmployee(optimisticTickets);

  if (optimisticTickets.length === 0) {
    return (
      <EmptyState icon={TicketIcon} title={tt("emptyTitle")} description={tt("emptyDescription")} />
    );
  }

  return (
    <div className="grid gap-6 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-[280px]">
      {Array.from(byEmployee.entries()).map(([empId, { employeeName, tickets: empTickets }]) => (
        <div key={empId} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {employeeName}
          </h2>
          <div className="flex flex-col gap-2">
            {empTickets.map((ticket) => {
              const isTransitioning = transitioning.has(ticket.id);
              const error = errors.get(ticket.id);
              const canMarkReady = ticket.status === "logged" || ticket.status === "reopened";

              return (
                <div
                  key={ticket.id}
                  className={[
                    "rounded-lg border bg-card p-3 shadow-xs transition-[background-color,border-color,box-shadow] duration-300",
                    statusClass(ticket.status),
                    isJustCreated(ticket)
                      ? "ring-2 ring-status-success-foreground bg-status-success animate-pulse"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {ticket.serviceName}
                        {ticket.variantName &&
                        ticket.variantName !== "Estándar" &&
                        ticket.variantName !== "Standard"
                          ? ` — ${ticket.variantName}`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{ticket.clientName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={[
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          ticket.status === "awaiting_payment"
                            ? "bg-status-attention text-status-attention-foreground"
                            : ticket.status === "reopened"
                              ? "bg-status-progress text-status-progress-foreground"
                              : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {ts(ticket.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <p
                      className="font-mono tabular-nums text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {formatMoney(ticket.unitPrice * ticket.quantity)}
                    </p>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {elapsed(ticket.createdAt)}
                    </p>
                  </div>

                  {canMarkReady && (
                    <div className="mt-2 border-t pt-2">
                      {error && (
                        <p className="mb-1 text-xs text-destructive" role="alert">
                          {error}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-full gap-1 text-xs"
                        disabled={isTransitioning}
                        onClick={() => handleMarkReady(ticket)}
                        aria-label={tt("markReady")}
                      >
                        {isTransitioning ? (
                          <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <CreditCardIcon className="size-3" aria-hidden="true" />
                        )}
                        {tt("markReady")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CashierDashboardSkeleton() {
  return (
    <div className="grid gap-6 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-[280px]">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="flex flex-col gap-2">
            {[1, 2].map((j) => (
              <div key={j} className="h-24 rounded-lg border bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CashierDashboardLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
