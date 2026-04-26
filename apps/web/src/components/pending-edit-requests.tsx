"use client";

/**
 * PendingEditRequests — T041
 *
 * Cashier panel showing pending ticket edit requests.
 * Refreshes on SSE ticket_updated events.
 */

import { useState, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckIcon, XIcon, ClipboardEditIcon } from "lucide-react";
import { useRealtimeEvent } from "@befine/realtime/client";
import {
  listPendingEditRequests,
  resolveEditRequest,
  type PendingEditRequest,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { Button } from "@/components/ui/button";

function formatDate(d: Date) {
  return new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function PendingEditRequests({
  initialRequests,
}: {
  initialRequests: PendingEditRequest[];
}) {
  const t = useTranslations("editRequests");
  const [requests, setRequests] = useState<PendingEditRequest[]>(initialRequests);
  const [resolving, setResolving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listPendingEditRequests();
      if (result.success) setRequests(result.data);
    });
  }, []);

  useRealtimeEvent("cashier", "ticket_updated", {
    onData: () => refresh(),
    onPoll: refresh,
  });

  async function handleResolve(id: string, decision: "approved" | "rejected") {
    setResolving(id);
    const result = await resolveEditRequest(id, decision);
    setResolving(null);
    if (!result.success) {
      toast.error(t("resolveError"));
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== id));
    toast.success(decision === "approved" ? t("approveSuccess") : t("rejectSuccess"));
  }

  if (requests.length === 0) {
    return (
      <section aria-label={t("pendingRequests")}>
        <h2 className="mb-3 text-sm font-semibold">{t("pendingRequests")}</h2>
        <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
      </section>
    );
  }

  return (
    <section aria-label={t("pendingRequests")}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardEditIcon className="size-4" aria-hidden="true" />
        {t("pendingRequests")}
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
          {requests.length}
        </span>
      </h2>

      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="rounded-lg border bg-card p-3 shadow-xs">
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
                  <span className="truncate rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {req.newServiceName} — {req.newVariantName}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                  aria-label={t("approve")}
                  disabled={resolving === req.id}
                  onClick={() => handleResolve(req.id, "approved")}
                >
                  <CheckIcon className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label={t("reject")}
                  disabled={resolving === req.id}
                  onClick={() => handleResolve(req.id, "rejected")}
                >
                  <XIcon className="size-4" aria-hidden="true" />
                </Button>
              </div>
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
      <div className="mb-3 h-4 w-40 rounded bg-muted animate-pulse" />
      <div className="flex flex-col gap-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    </section>
  );
}
