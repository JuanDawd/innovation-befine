"use client";

/**
 * MyEditRequests — T041, T037
 *
 * Secretary / stylist view: lists today's open ticket items with a "Request edit" button
 * and a "Mark ready for payment" button (T037), plus a "My requests" status section.
 */

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ClipboardListIcon, CreditCardIcon, Loader2Icon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listMyOpenTicketItems,
  listMyEditRequests,
  type OpenTicketItem,
  type MyEditRequest,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { transitionToAwaitingPayment } from "@/app/(protected)/tickets/actions";
import { RequestEditDialog } from "@/components/request-edit-dialog";
import { Button } from "@/components/ui/button";

function formatPrice(n: number) {
  return `$${n.toLocaleString("es-CO")}`;
}

function formatTime(d: Date) {
  return new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function statusClass(status: MyEditRequest["status"]) {
  if (status === "approved")
    return "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300";
  if (status === "rejected") return "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";
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
  const [items, setItems] = useState<OpenTicketItem[]>(initialItems);
  const [requests, setRequests] = useState<MyEditRequest[]>(initialRequests);
  const [transitioning, setTransitioning] = useState<Set<string>>(new Set());
  const [transitionErrors, setTransitionErrors] = useState<Map<string, string>>(new Map());
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [itemsRes, requestsRes] = await Promise.all([
        listMyOpenTicketItems(),
        listMyEditRequests(),
      ]);
      if (itemsRes.success) setItems(itemsRes.data);
      if (requestsRes.success) setRequests(requestsRes.data);
    });
  }, []);

  async function handleMarkReady(ticketId: string) {
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
      setTransitionErrors((prev) => new Map(prev).set(ticketId, tt("markReadyError")));
    } else {
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* My services today */}
      <section aria-label={t("sectionTitle")}>
        <h2 className="mb-3 text-sm font-semibold">{t("sectionTitle")}</h2>
        {items.length === 0 ? (
          <EmptyState icon={ClipboardListIcon} title={t("sectionEmpty")} />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const isReady = item.ticketStatus === "awaiting_payment";
              const isTransitioning = transitioning.has(item.ticketId);
              const transitionError = transitionErrors.get(item.ticketId);

              return (
                <div key={item.itemId} className="rounded-lg border bg-card p-3 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.serviceName} — {item.variantName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{item.clientName}</p>
                      <p className="mt-0.5 font-mono tabular-nums text-xs text-muted-foreground">
                        {formatPrice(item.unitPrice)}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {isReady ? (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {tt("alreadyReady")}
                        </span>
                      ) : item.hasPendingRequest ? (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {t("pendingBadge")}
                        </span>
                      ) : (
                        <RequestEditDialog
                          ticketItemId={item.itemId}
                          currentServiceName={item.serviceName}
                          currentVariantName={item.variantName}
                          currentVariantId={item.serviceVariantId}
                          onSuccess={refresh}
                        />
                      )}
                    </div>
                  </div>

                  {/* Mark ready button — only for logged tickets */}
                  {item.ticketStatus === "logged" && (
                    <div className="mt-2 border-t pt-2">
                      {transitionError && (
                        <p className="mb-1 text-xs text-destructive" role="alert">
                          {transitionError}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-full gap-1 text-xs"
                        disabled={isTransitioning}
                        onClick={() => handleMarkReady(item.ticketId)}
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
        )}
      </section>

      {/* My submitted requests */}
      {requests.length > 0 && (
        <section aria-label={t("myRequestsTitle")}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ClipboardListIcon className="size-4" aria-hidden="true" />
            {t("myRequestsTitle")}
          </h2>
          <div className="flex flex-col gap-2">
            {requests.map((req) => (
              <div key={req.id} className="rounded-lg border bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">{req.clientName}</p>
                    <p className="text-sm truncate">
                      <span className="line-through text-muted-foreground">
                        {req.currentServiceName} — {req.currentVariantName}
                      </span>
                      {" → "}
                      <span className="font-medium">
                        {req.newServiceName} — {req.newVariantName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatTime(req.createdAt)}</p>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      statusClass(req.status),
                    ].join(" ")}
                  >
                    {statusLabel(req.status, t)}
                  </span>
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
            <div key={i} className="h-20 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    </div>
  );
}
