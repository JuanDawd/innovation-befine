"use client";

/**
 * PendingEditRequests — T041
 *
 * Cashier side-rail panel showing pending ticket edit requests. When empty it
 * collapses to one line, and below 1280px (rail stacked above the board) it
 * hides entirely so it never pushes the board down.
 * Server state via TanStack Query (`editRequests.pending`), invalidated by
 * realtime ticket events and saves; 30 s refetch backup.
 */

import { notifyDataChanged } from "@/lib/data-events";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckIcon, XIcon } from "lucide-react";
import {
  resolveEditRequest,
  type PendingEditRequest,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { Button } from "@/components/ui/button";
import { fetchQuery } from "@/lib/action-query";

function formatDate(d: Date) {
  return new Date(d).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PendingEditRequests({
  initialRequests,
  loadFailed = false,
}: {
  initialRequests: PendingEditRequest[];
  /** The server-side read failed: fetch on the client instead of showing "none pending". */
  loadFailed?: boolean;
}) {
  const t = useTranslations("editRequests");
  const tBoard = useTranslations("cashierBoard");
  const {
    data: requests,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.editRequests.pending,
    queryFn: () => fetchQuery("pendingEditRequests"),
    initialData: loadFailed ? undefined : initialRequests,
    refetchInterval: 30_000,
  });
  const [resolving, setResolving] = useState<string | null>(null);

  async function handleResolve(id: string, decision: "approved" | "rejected") {
    setResolving(id);
    const result = await resolveEditRequest(id, decision);
    setResolving(null);
    if (!result.success) {
      toast.error(t("resolveError"));
      return;
    }
    notifyDataChanged("editRequests", "tickets");
    toast.success(decision === "approved" ? t("approveSuccess") : t("rejectSuccess"));
  }

  const heading = (count?: number) => (
    <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
      {t("pendingRequests")}
      {count !== undefined && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-attention px-1.5 text-xs font-semibold tabular-nums text-status-attention-foreground">
          {count}
        </span>
      )}
    </h2>
  );

  if (!requests) {
    if (!isError) return <PendingEditRequestsSkeleton />;
    return (
      <section aria-label={t("pendingRequests")}>
        {heading()}
        <p
          className="flex items-center gap-1.5 text-sm text-status-negative-foreground"
          role="alert"
        >
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
          {t("loadError")}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void refetch()}>
          {tBoard("retry")}
        </Button>
      </section>
    );
  }

  if (requests.length === 0) {
    return (
      <section className="hidden xl:block" aria-label={t("pendingRequests")}>
        {heading()}
        <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
      </section>
    );
  }

  return (
    <section aria-label={t("pendingRequests")}>
      {heading(requests.length)}

      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{req.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {req.employeeName} ·{" "}
                  {req.requestedByName !== req.employeeName
                    ? `${t("colRequestedBy")}: ${req.requestedByName} · `
                    : ""}
                  {formatDate(req.createdAt)}
                </p>
                <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-xs">
                  <span className="truncate rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {req.currentServiceName} — {req.currentVariantName}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="truncate rounded bg-status-attention px-1.5 py-0.5 font-medium text-status-attention-foreground">
                    {req.newServiceName} — {req.newVariantName}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-11"
                aria-label={t("rejectLabel", { client: req.clientName })}
                disabled={resolving === req.id}
                onClick={() => handleResolve(req.id, "rejected")}
              >
                <XIcon aria-hidden="true" />
                {t("reject")}
              </Button>
              <Button
                size="sm"
                className="pointer-coarse:h-11"
                aria-label={t("approveLabel", { client: req.clientName })}
                disabled={resolving === req.id}
                onClick={() => handleResolve(req.id, "approved")}
              >
                <CheckIcon aria-hidden="true" />
                {t("approve")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PendingEditRequestsSkeleton() {
  return (
    <section>
      <div className="mb-2 h-5 w-48 rounded bg-muted animate-pulse" />
      <div className="flex flex-col gap-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />
        ))}
      </div>
    </section>
  );
}
