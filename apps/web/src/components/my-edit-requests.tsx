"use client";

/**
 * MyEditRequests — T041
 *
 * Secretary / stylist view: lists today's open ticket items with a "Request edit" button,
 * plus a "My requests" status section showing submitted requests.
 */

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ClipboardListIcon } from "lucide-react";
import {
  listMyOpenTicketItems,
  listMyEditRequests,
  type OpenTicketItem,
  type MyEditRequest,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { RequestEditDialog } from "@/components/request-edit-dialog";

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
  const [items, setItems] = useState<OpenTicketItem[]>(initialItems);
  const [requests, setRequests] = useState<MyEditRequest[]>(initialRequests);
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

  return (
    <div className="flex flex-col gap-6">
      {/* My services today */}
      <section aria-label={t("sectionTitle")}>
        <h2 className="mb-3 text-sm font-semibold">{t("sectionTitle")}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sectionEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
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
                    {item.hasPendingRequest ? (
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
              </div>
            ))}
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
            <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    </div>
  );
}
