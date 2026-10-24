"use client";

/**
 * MyEditRequests — T041, T037
 *
 * Secretary / stylist view: today's open ticket items grouped by what to do next —
 * "Por marcar listos" (with the mark-ready action, T037, undoable from its
 * toast), "Reabiertos", "Esperando cobro" — each with a "Request edit" action —
 * then a folded "Cobrados hoy" so it's clear what was already paid, plus a
 * "My requests" status section.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { notifyDataChanged } from "@/lib/data-events";
import { queryKeys } from "@/lib/query-keys";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  CreditCardIcon,
  Loader2Icon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  type OpenTicketItem,
  type MyEditRequest,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { transitionToAwaitingPayment, undoMarkReady } from "@/app/(protected)/tickets/actions";
import { RequestEditDialog } from "@/components/request-edit-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/i18n";
import { fetchQuery } from "@/lib/action-query";

/** Variant names that only restate the default — not worth showing. */
const DEFAULT_VARIANTS = new Set(["Estándar", "Standard"]);

function formatPrice(n: number) {
  return formatMoney(n);
}

const CHARGED = new Set<OpenTicketItem["ticketStatus"]>(["closed", "paid_offline"]);

function requestStatus(status: MyEditRequest["status"]) {
  if (status === "approved") return "success";
  if (status === "rejected") return "negative";
  return "attention";
}

function statusLabel(status: MyEditRequest["status"], t: (k: string) => string) {
  if (status === "approved") return t("statusApproved");
  if (status === "rejected") return t("statusRejected");
  return t("statusPending");
}

export function MyEditRequests({
  initialItems,
  initialRequests,
}: {
  initialItems: OpenTicketItem[];
  initialRequests: MyEditRequest[];
}) {
  const t = useTranslations("editRequests");
  const tt = useTranslations("tickets");
  const format = useFormatter();
  const { data: items = initialItems } = useQuery({
    queryKey: queryKeys.tickets.mine,
    queryFn: () => fetchQuery("myOpenTicketItems"),
    initialData: initialItems,
    refetchInterval: 30_000,
  });
  const { data: requests = initialRequests } = useQuery({
    queryKey: queryKeys.editRequests.mine,
    queryFn: () => fetchQuery("myEditRequests"),
    initialData: initialRequests,
    refetchInterval: 30_000,
  });
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [transitionErrors, setTransitionErrors] = useState<Map<string, string>>(new Map());

  const refresh = () => notifyDataChanged("tickets", "editRequests");

  async function handleUndo(ticketId: string) {
    const result = await undoMarkReady({ ticketId });
    if (result.success) toast.success(tt("undoSuccess"));
    else toast.error(tt("undoError"));
    refresh();
  }

  async function handleMarkReady(ticketId: string, client: string) {
    setTransitioning((prev) => new Set(prev).add(ticketId));
    setTransitionErrors((prev) => {
      const next = new Map(prev);
      next.delete(ticketId);
      return next;
    });

    const result = await transitionToAwaitingPayment({ ticketId });

    setTransitioning((prev) => {
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });

    if (!result.success) {
      setTransitionErrors((prev) =>
        new Map(prev).set(ticketId, `${tt("markReadyError")}: ${result.error.message}`),
      );
    } else {
      toast.success(tt("markReadySuccess", { client }), {
        duration: 6000,
        action: { label: tt("undo"), onClick: () => handleUndo(ticketId) },
      });
      refresh();
    }
  }

  const amount = (list: OpenTicketItem[]) =>
    list.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const charged = items.filter((i) => CHARGED.has(i.ticketStatus));
  const open = items.filter((i) => !CHARGED.has(i.ticketStatus));
  const groups = [
    {
      key: "toMark",
      label: t("groupToMark"),
      status: "logged",
      items: open.filter((i) => i.ticketStatus === "logged"),
    },
    {
      key: "reopened",
      label: t("groupReopened"),
      status: "reopened",
      items: open.filter((i) => i.ticketStatus === "reopened"),
    },
    {
      key: "waiting",
      label: t("groupWaiting"),
      status: "awaiting_payment",
      items: open.filter((i) => i.ticketStatus === "awaiting_payment"),
    },
  ].filter((g) => g.items.length > 0);

  function serviceLabel(item: OpenTicketItem) {
    return DEFAULT_VARIANTS.has(item.variantName)
      ? item.serviceName
      : `${item.serviceName} · ${item.variantName}`;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* My services today */}
      <section aria-labelledby="my-services-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="my-services-heading" className="text-lg font-semibold">
            {t("sectionTitle")}
          </h2>
          {items.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {charged.length > 0
                ? t("daySummarySplit", {
                    count: items.length,
                    charged: formatPrice(amount(charged)),
                    pending: formatPrice(amount(open)),
                  })
                : t("daySummary", { count: items.length, total: formatPrice(amount(items)) })}
            </p>
          )}
        </div>
        {items.length === 0 && <EmptyState icon={ClipboardListIcon} title={t("sectionEmpty")} />}
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`group-${group.key}`}
            className="flex flex-col gap-2.5"
          >
            <h3 id={`group-${group.key}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <StatusBadge status={group.status} label={group.label} />
              <span className="text-xs text-muted-foreground tabular-nums">
                <span aria-hidden="true">{group.items.length}</span>
                <span className="sr-only">{t("itemCount", { count: group.items.length })}</span>
              </span>
            </h3>
            {group.key === "toMark" && (
              <p className="-mt-1 text-xs text-muted-foreground">{t("toMarkHint")}</p>
            )}
            {group.key === "waiting" && (
              <p className="-mt-1 text-xs text-muted-foreground">{t("waitingHint")}</p>
            )}
            <ul className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
              {group.items.map((item) => {
                const isTransitioning = transitioning.has(item.ticketId);
                const transitionError = transitionErrors.get(item.ticketId);
                const canMarkReady = item.ticketStatus === "logged";

                return (
                  <li key={item.itemId} className="min-w-0 rounded-xl border bg-card px-3.5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">{item.clientName}</p>
                      <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                        {formatPrice(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {serviceLabel(item)}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </p>

                    {transitionError && (
                      <p className="mt-2 text-xs text-destructive" role="alert">
                        {transitionError}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      {item.hasPendingRequest ? (
                        <StatusBadge status="attention" label={t("pendingBadge")} />
                      ) : (
                        <RequestEditDialog
                          ticketItemId={item.itemId}
                          currentServiceName={item.serviceName}
                          currentVariantName={item.variantName}
                          currentVariantId={item.serviceVariantId}
                          onSuccess={refresh}
                        />
                      )}
                      {canMarkReady && (
                        <Button
                          className="gap-1.5 max-sm:h-11 max-sm:flex-1"
                          disabled={isTransitioning}
                          onClick={() => handleMarkReady(item.ticketId, item.clientName)}
                          aria-label={t("markReadyLabel", {
                            client: item.clientName,
                            service: serviceLabel(item),
                          })}
                        >
                          {isTransitioning ? (
                            <Loader2Icon className="animate-spin" aria-hidden="true" />
                          ) : (
                            <CreditCardIcon aria-hidden="true" />
                          )}
                          {tt("markReady")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {charged.length > 0 && (
          <details className="group/charged flex flex-col rounded-xl border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl px-3.5 py-2 [&::-webkit-details-marker]:hidden">
              <StatusBadge status="closed" label={t("groupCharged")} />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                {t("chargedSummary", {
                  count: charged.length,
                  total: formatPrice(amount(charged)),
                })}
              </span>
              <ChevronDownIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open/charged:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <ul className="divide-y divide-border border-t">
              {charged.map((item) => (
                <li
                  key={item.itemId}
                  className="flex items-baseline justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {serviceLabel(item)}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* My submitted requests */}
      {requests.length > 0 && (
        <section aria-label={t("myRequestsTitle")}>
          <h2 className="mb-3 text-lg font-semibold">{t("myRequestsTitle")}</h2>
          <div className="flex flex-col gap-2">
            {requests.map((req) => (
              <div key={req.id} className="rounded-xl border bg-card px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">{req.clientName}</p>
                    <p className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="truncate text-muted-foreground line-through">
                        {req.currentServiceName} · {req.currentVariantName}
                      </span>
                      <ArrowRightIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">
                        {req.newServiceName} · {req.newVariantName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(req.createdAt), {
                        timeZone: "America/Bogota",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <StatusBadge
                    className="shrink-0"
                    status={requestStatus(req.status)}
                    label={statusLabel(req.status, t)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function MyEditRequestsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-3 h-4 w-32 rounded bg-muted animate-pulse" />
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    </div>
  );
}
