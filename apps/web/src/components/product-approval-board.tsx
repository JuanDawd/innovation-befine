"use client";

/**
 * ProductApprovalBoard — T047
 *
 * Secretary/admin view for approving product pieces that clothiers have marked as done.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  listPendingProductPieceApprovals,
  approveProductPiece,
  type PendingProductPieceApprovalRow,
} from "@/app/(protected)/products/approval-actions";

export function ProductApprovalBoard() {
  const t = useTranslations("products");

  const [pieces, setPieces] = useState<PendingProductPieceApprovalRow[]>([]);
  const [isLoading, startLoadTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    startLoadTransition(async () => {
      const res = await listPendingProductPieceApprovals();
      if (res.success) setPieces(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(piece: PendingProductPieceApprovalRow) {
    setPendingId(piece.id);
    const res = await approveProductPiece(piece.id, piece.version);
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({
        ...m,
        [piece.id]: res.error.code === "STALE_DATA" ? t("staleError") : t("approveError"),
      }));
    } else {
      load();
    }
  }

  if (isLoading && pieces.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {t("pageTitle")}
      </div>
    );
  }

  if (pieces.length === 0) {
    return <EmptyState icon={CheckCircle2Icon} title={t("noApprovals")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("approvalsTitle")}</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t("colPiece")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("colClothier")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pieces.map((piece) => (
              <tr key={piece.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{piece.clothPieceName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {piece.assignedEmployeeName ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ConfirmationDialog
                      trigger={
                        <Button size="sm" disabled={pendingId === piece.id}>
                          {pendingId === piece.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            t("approve")
                          )}
                        </Button>
                      }
                      title={t("approveConfirmTitle")}
                      description={t("approveConfirmDescription")}
                      confirmLabel={t("approve")}
                      onConfirm={() => handleApprove(piece)}
                    />
                    {errorMap[piece.id] && (
                      <p className="text-xs text-destructive">{errorMap[piece.id]}</p>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
