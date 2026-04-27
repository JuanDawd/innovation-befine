"use client";

/**
 * BatchApprovalBoard — T047
 *
 * Secretary/admin view for approving batch pieces.
 * Admins also see a "Approve directly" button for pending pieces.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  listPendingApprovals,
  approvePiece,
  adminMarkApproved,
  type PendingApprovalRow,
} from "@/app/(protected)/batches/approval-actions";

export function BatchApprovalBoard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("batches");

  const [pieces, setPieces] = useState<PendingApprovalRow[]>([]);
  const [isLoading, startLoadTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    startLoadTransition(async () => {
      const res = await listPendingApprovals();
      if (res.success) setPieces(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(piece: PendingApprovalRow) {
    setPendingId(piece.id);
    const res = await approvePiece(piece.id, piece.version);
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

  async function handleAdminApprove(piece: PendingApprovalRow) {
    setPendingId(piece.id);
    const res = await adminMarkApproved(piece.id, piece.version);
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

  const pending = pieces.filter((p) => p.status === "done_pending_approval");
  const directApprovable = pieces.filter((p) => p.status === "pending" && isAdmin);

  if (isLoading && pieces.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {t("pageTitle")}
      </div>
    );
  }

  if (pending.length === 0 && directApprovable.length === 0) {
    return <EmptyState icon={CheckCircle2Icon} title={t("noApprovals")} />;
  }

  const allRows = [...pending, ...(isAdmin ? directApprovable : [])];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("approvalsTitle")}</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t("colPiece")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("colClothier")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allRows.map((piece) => (
              <tr key={piece.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{piece.clothPieceName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {piece.assignedEmployeeName ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      piece.status === "done_pending_approval"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {piece.status === "done_pending_approval" ? "Listo" : "Pendiente"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {piece.status === "done_pending_approval" && (
                      <ConfirmationDialog
                        trigger={
                          <Button size="sm" disabled={pendingId === piece.id}>
                            {pendingId === piece.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
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
                    )}
                    {piece.status === "pending" && isAdmin && (
                      <ConfirmationDialog
                        trigger={
                          <Button size="sm" variant="outline" disabled={pendingId === piece.id}>
                            {pendingId === piece.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              t("approveDirectly")
                            )}
                          </Button>
                        }
                        title={t("approveDirectlyConfirmTitle")}
                        description={t("approveDirectlyConfirmDescription")}
                        confirmLabel={t("approveDirectly")}
                        onConfirm={() => handleAdminApprove(piece)}
                      />
                    )}
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
