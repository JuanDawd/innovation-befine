"use client";

/**
 * ProductApprovalBoard — T047
 *
 * Secretary/admin: pieces clothiers marked as done, waiting to be approved.
 * Each row says what, how many, who made it and for which order — the same
 * facts the confirmation repeats, since approving makes the piece payable.
 */

import { notifyDataChanged } from "@/lib/data-events";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { queryKeys } from "@/lib/query-keys";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  approveProductPiece,
  type PendingProductPieceApprovalRow,
} from "@/app/(protected)/products/approval-actions";
import { fetchQuery } from "@/lib/action-query";
import { businessDateOf, todayInBogota } from "@/lib/dates";

/** Variant names that only restate the default — not worth showing. */
const DEFAULT_VARIANTS = new Set(["Estándar", "Standard"]);

export function ProductApprovalBoard() {
  const t = useTranslations("products");
  const format = useFormatter();

  const { data: pieces = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.products.approvals,
    queryFn: () => fetchQuery("pendingProductPieceApprovals"),
    refetchInterval: 60_000,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const label = (piece: PendingProductPieceApprovalRow) =>
    `${piece.clothPieceName}${DEFAULT_VARIANTS.has(piece.clothPieceVariantName) ? "" : ` · ${piece.clothPieceVariantName}`} ×${piece.quantity}`;

  async function handleApprove(piece: PendingProductPieceApprovalRow) {
    setPendingId(piece.id);
    const res = await approveProductPiece(piece.id, piece.version);
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({
        ...m,
        [piece.id]:
          res.error.code === "STALE_DATA"
            ? t("staleError")
            : res.error.code === "CONFLICT"
              ? res.error.message
              : t("approveError"),
      }));
      if (res.error.code === "STALE_DATA") notifyDataChanged("products");
    } else {
      toast.success(t("approveSuccess", { piece: label(piece) }));
      notifyDataChanged("products");
    }
  }

  if (isLoading && pieces.length === 0) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  const today = todayInBogota();

  return (
    <section aria-labelledby="approvals-heading" className="flex flex-col gap-2">
      <h2 id="approvals-heading" className="flex items-baseline gap-2 text-lg font-semibold">
        {t("approvalsTitle")}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">
          {pieces.length}
        </span>
      </h2>
      {pieces.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noApprovals")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {pieces.map((piece) => {
            const clothier = piece.assignedEmployeeName ?? t("noAssigned");
            const productDate = businessDateOf(piece.productCreatedAt);
            const context = piece.largeOrderClientName ?? piece.productNotes;
            return (
              <li
                key={piece.id}
                className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{label(piece)}</p>
                    <StatusBadge status="done_pending_approval" label={t("awaitingApproval")} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {clothier}
                    {context && (
                      <>
                        {" · "}
                        {piece.largeOrderId ? (
                          <Link
                            href={`/large-orders/${piece.largeOrderId}#produccion`}
                            className="underline-offset-2 hover:underline"
                          >
                            {context}
                          </Link>
                        ) : (
                          context
                        )}
                      </>
                    )}
                    {productDate !== today &&
                      ` · ${t("fromDate", {
                        date: format.dateTime(new Date(`${productDate}T12:00:00-05:00`), {
                          day: "numeric",
                          month: "short",
                          timeZone: "America/Bogota",
                        }),
                      })}`}
                  </p>
                  {errorMap[piece.id] && (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {errorMap[piece.id]}
                    </p>
                  )}
                </div>
                <ConfirmationDialog
                  trigger={
                    <Button
                      size="sm"
                      className="shrink-0 max-sm:w-full"
                      disabled={pendingId === piece.id}
                      aria-label={t("approveLabel", { piece: label(piece), clothier })}
                    >
                      {pendingId === piece.id && (
                        <Loader2Icon className="animate-spin" aria-hidden="true" />
                      )}
                      {t("approve")}
                    </Button>
                  }
                  title={t("approveConfirmTitle", { piece: label(piece), clothier })}
                  description={t("approveConfirmDescription", { clothier })}
                  confirmLabel={t("approve")}
                  onConfirm={() => handleApprove(piece)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
