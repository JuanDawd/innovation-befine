"use client";

/**
 * CashierDashboard — T036, T037
 *
 * The live board: open tickets grouped by status in the order the cashier
 * works them (Por cobrar → En proceso → Reabiertos), oldest first.
 * Server state via TanStack Query (`tickets.open`): realtime events and saves
 * invalidate it (RealtimeQueryBridge / notifyDataChanged); 30 s refetch backup.
 *
 * - Awaiting-payment cards open checkout with that client's tickets selected.
 * - Logged / reopened cards can be marked "awaiting payment" in place — T037.
 * - "/" focuses the search field.
 */

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  startTransition as reactStartTransition,
} from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  ClockAlertIcon,
  CreditCardIcon,
  Loader2Icon,
  SearchIcon,
  TicketIcon,
} from "lucide-react";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  transitionToAwaitingPayment,
  transitionReopenedToAwaitingPayment,
  type DashboardTicket,
} from "@/app/(protected)/tickets/actions";
import {
  formatAge,
  groupByStatus,
  isStale,
  matchesQuery,
  optimisticStatusReducer,
  ticketTotal,
  type BoardGroup,
} from "./cashier-dashboard-helpers";
import { formatMoney } from "@/i18n";
import { fetchQuery } from "@/lib/action-query";
import { cn } from "@/lib/utils";

const GROUP_LABEL_KEY: Record<BoardGroup, "groupAwaiting" | "groupLogged" | "groupReopened"> = {
  awaiting_payment: "groupAwaiting",
  logged: "groupLogged",
  reopened: "groupReopened",
};

/** Variant names that only restate the default — not worth showing on a card. */
const DEFAULT_VARIANTS = new Set(["Estándar", "Standard"]);

function serviceLabel(ticket: DashboardTicket): string {
  return DEFAULT_VARIANTS.has(ticket.variantName)
    ? ticket.serviceName
    : `${ticket.serviceName} · ${ticket.variantName}`;
}

/** Highlight tickets created in the last 10 s (replaces the SSE-driven flash). */
function isJustCreated(ticket: DashboardTicket, now: number): boolean {
  return now - new Date(ticket.createdAt).getTime() < 10_000;
}

/** Wall clock for ticket ages, ticking every 30 s so ages stay fresh between refetches. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BOARD_GRID = "grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]";

// ─── Card ─────────────────────────────────────────────────────────────────────

function TicketCardBody({
  ticket,
  now,
  trailing,
}: {
  ticket: DashboardTicket;
  now: number;
  trailing: React.ReactNode;
}) {
  const t = useTranslations("cashierBoard");
  const ageMs = Math.max(0, now - new Date(ticket.createdAt).getTime());
  const stale = isStale(ageMs);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {ticket.clientName}
        </p>
        <p
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs tabular-nums",
            stale ? "font-medium text-status-attention-foreground" : "text-muted-foreground",
          )}
          suppressHydrationWarning
        >
          {stale && <ClockAlertIcon className="size-3.5" aria-hidden="true" />}
          <span aria-hidden="true" suppressHydrationWarning>
            {formatAge(ageMs)}
          </span>
          <span className="sr-only" suppressHydrationWarning>
            {stale ? `${t("ageStale")}. ` : ""}
            {t("ageLabel", { age: formatAge(ageMs) })}
          </span>
        </p>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {serviceLabel(ticket)} · {t("withEmployee", { employee: ticket.employeeName })}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-mono text-base font-medium tabular-nums text-foreground">
          {formatMoney(ticketTotal(ticket))}
        </p>
        {trailing}
      </div>
    </>
  );
}

const CARD_BASE =
  "rounded-xl border bg-card px-3.5 py-3 transition-[border-color,box-shadow,background-color] duration-200";

function ChargeCard({ ticket, now }: { ticket: DashboardTicket; now: number }) {
  const t = useTranslations("cashierBoard");
  return (
    <Link
      href={`/cashier/checkout?ticket=${ticket.id}`}
      scroll={false}
      aria-label={t("chargeLabel", {
        client: ticket.clientName,
        service: serviceLabel(ticket),
        total: formatMoney(ticketTotal(ticket)),
      })}
      className={cn(
        CARD_BASE,
        "group block hover:border-primary/40 hover:shadow-[0_2px_8px_-2px] hover:shadow-primary/15 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isJustCreated(ticket, now) && "border-status-success-foreground/60 bg-status-success/40",
      )}
    >
      <TicketCardBody
        ticket={ticket}
        now={now}
        trailing={
          <span className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors duration-200 group-hover:text-primary group-focus-visible:text-primary">
            {t("charge")}
            <ChevronRightIcon
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        }
      />
    </Link>
  );
}

function WorkCard({
  ticket,
  now,
  busy,
  error,
  onMarkReady,
}: {
  ticket: DashboardTicket;
  now: number;
  busy: boolean;
  error?: string;
  onMarkReady: () => void;
}) {
  const t = useTranslations("cashierBoard");
  const tt = useTranslations("tickets");
  return (
    <div
      className={cn(
        CARD_BASE,
        isJustCreated(ticket, now) && "border-status-success-foreground/60 bg-status-success/40",
      )}
    >
      <TicketCardBody
        ticket={ticket}
        now={now}
        trailing={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 pointer-coarse:h-11"
            disabled={busy}
            onClick={onMarkReady}
            aria-label={t("markReadyLabel", {
              client: ticket.clientName,
              service: serviceLabel(ticket),
            })}
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CreditCardIcon className="size-3.5" aria-hidden="true" />
            )}
            {tt("markReady")}
          </Button>
        }
      />
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

export function CashierDashboard({
  initialTickets,
  loadFailed = false,
}: {
  initialTickets: DashboardTicket[];
  /** The server-side read failed: fetch on the client instead of trusting an empty list. */
  loadFailed?: boolean;
}) {
  const t = useTranslations("cashierBoard");
  const tt = useTranslations("tickets");
  const {
    data: tickets,
    isError,
    isPending,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tickets.open,
    queryFn: () => fetchQuery("openTickets"),
    initialData: loadFailed ? undefined : initialTickets,
    refetchInterval: 30_000,
  });
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  // Re-read the clock whenever fresh data lands, and every 30 s in between.
  const tick = useNow();
  const now = Math.max(tick, dataUpdatedAt);
  const searchRef = useRef<HTMLInputElement>(null);

  // T10R-R2 — optimistic status update; reverts naturally if the action errors
  // because the query data is only replaced on a successful refetch.
  const [optimisticTickets, applyOptimistic] = useOptimistic(
    tickets ?? [],
    optimisticStatusReducer,
  );

  // Announce newly arrived tickets to screen readers (adjust-state-during-render).
  const idsKey = optimisticTickets.map((tk) => tk.id).join(",");
  const [seenIds, setSeenIds] = useState(idsKey);
  const [announcement, setAnnouncement] = useState("");
  if (idsKey !== seenIds) {
    const before = new Set(seenIds.split(","));
    const added = optimisticTickets.filter((tk) => !before.has(tk.id)).length;
    setSeenIds(idsKey);
    if (added > 0) setAnnouncement(t("announceNew", { count: added }));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  // ── Header: title, count, live state, search ──
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 id="live-board" className="text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{t("count", { count: optimisticTickets.length })}</span>
          <span aria-hidden="true">·</span>
          {isError && tickets ? (
            <span className="flex items-center gap-1.5 font-medium text-status-negative-foreground">
              <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
              {t("offline")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-status-success-foreground"
                aria-hidden="true"
              />
              <span className="font-medium text-status-success-foreground">{t("live")}</span>
              {dataUpdatedAt > 0 && (
                <span suppressHydrationWarning>
                  · {t("updatedAt", { time: formatClock(dataUpdatedAt) })}
                </span>
              )}
            </span>
          )}
        </p>
      </div>
      {optimisticTickets.length > 0 && (
        <div className="relative w-full sm:w-72">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            aria-keyshortcuts="/"
            className="pr-8 pl-8"
          />
          <kbd
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            /
          </kbd>
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (isPending) {
    body = <BoardGridSkeleton />;
  } else if (isError && !tickets) {
    body = (
      <EmptyState
        icon={AlertTriangleIcon}
        title={t("loadErrorTitle")}
        description={t("loadErrorDescription")}
        action={{ label: t("retry"), onClick: () => void refetch() }}
      />
    );
  } else if (optimisticTickets.length === 0) {
    body = (
      <EmptyState icon={TicketIcon} title={tt("emptyTitle")} description={tt("emptyDescription")} />
    );
  } else {
    const groups = groupByStatus(optimisticTickets.filter((tk) => matchesQuery(tk, query)));
    body =
      groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noMatches", { query: query.trim() })}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ status, tickets: groupTickets }) => (
            <section key={status} aria-labelledby={`board-${status}`}>
              <h3
                id={`board-${status}`}
                className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1"
              >
                <StatusBadge status={status} label={t(GROUP_LABEL_KEY[status])} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("groupTotal", {
                    count: groupTickets.length,
                    total: formatMoney(groupTickets.reduce((s, tk) => s + ticketTotal(tk), 0)),
                  })}
                </span>
              </h3>
              <ul className={BOARD_GRID}>
                {groupTickets.map((ticket) => (
                  <li key={ticket.id} className="min-w-0">
                    {ticket.status === "awaiting_payment" ? (
                      <ChargeCard ticket={ticket} now={now} />
                    ) : (
                      <WorkCard
                        ticket={ticket}
                        now={now}
                        busy={transitioning.has(ticket.id)}
                        error={errors.get(ticket.id)}
                        onMarkReady={() => handleMarkReady(ticket)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
  }

  return (
    <section aria-labelledby="live-board" className="flex min-w-0 flex-col gap-4">
      {header}
      {body}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

function BoardGridSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="h-5 w-40 rounded-full bg-muted animate-pulse" />
      <div className={BOARD_GRID}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-[6.5rem] rounded-xl border bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function CashierDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="h-5 w-36 rounded bg-muted animate-pulse" />
        <div className="h-4 w-52 rounded bg-muted animate-pulse" />
      </div>
      <BoardGridSkeleton />
    </div>
  );
}

export function CashierDashboardLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
