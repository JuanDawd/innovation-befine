"use client";

/**
 * ClothierWorkBoard — T046
 *
 * Mobile-first board showing the clothier's assigned pieces and unassigned
 * (claimable) pieces for today. Large tap targets, checklist style, progress bar.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, CircleIcon, Loader2Icon, PlusCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listTodayBatchPieces,
  claimPiece,
  markPieceDone,
  type BatchPieceRow,
} from "@/app/(protected)/clothier/actions";

export function ClothierWorkBoard({ employeeId }: { employeeId: string }) {
  const t = useTranslations("clothierWork");

  const [pieces, setPieces] = useState<BatchPieceRow[]>([]);
  const [isLoading, startLoadTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    startLoadTransition(async () => {
      const res = await listTodayBatchPieces();
      if (res.success) setPieces(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myPieces = pieces.filter((p) => p.assignedToEmployeeId === employeeId);
  const available = pieces.filter((p) => p.assignedToEmployeeId === null);

  const doneCount = myPieces.filter(
    (p) => p.status === "done_pending_approval" || p.status === "approved",
  ).length;
  const totalMine = myPieces.length;

  async function handleClaim(piece: BatchPieceRow) {
    setPendingId(piece.id);
    const res = await claimPiece(piece.id, piece.version);
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({ ...m, [piece.id]: t("claimError") }));
    } else {
      load();
    }
  }

  async function handleMarkDone(piece: BatchPieceRow) {
    setPendingId(piece.id);
    const res = await markPieceDone(piece.id, piece.version);
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({
        ...m,
        [piece.id]: res.error.code === "STALE_DATA" ? t("staleError") : t("markDoneError"),
      }));
    } else {
      load();
    }
  }

  if (isLoading && pieces.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (myPieces.length === 0 && available.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
        <CheckCircle2Icon className="h-10 w-10 text-muted-foreground" />
        <p className="font-semibold">{t("emptyTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Progress bar */}
      {totalMine > 0 && (
        <div className="flex flex-col gap-1.5 px-4 pt-4">
          <p className="text-xs text-muted-foreground">
            {t("progress", { done: doneCount, total: totalMine })}
          </p>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${totalMine > 0 ? (doneCount / totalMine) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* My assigned pieces */}
      {myPieces.length > 0 && (
        <section>
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("myPieces")}
          </p>
          <ul className="divide-y divide-border">
            {myPieces.map((piece) => (
              <li
                key={piece.id}
                className="flex items-center justify-between gap-3 px-4 py-4 min-h-[64px]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {piece.status === "pending" ? (
                    <CircleIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <CheckCircle2Icon className="h-5 w-5 shrink-0 text-green-600" />
                  )}
                  <span
                    className={`text-sm font-medium truncate ${
                      piece.status !== "pending" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {piece.clothPieceName}
                  </span>
                </div>

                {piece.status === "pending" && (
                  <Button
                    size="sm"
                    onClick={() => handleMarkDone(piece)}
                    disabled={pendingId === piece.id}
                    className="shrink-0 min-w-[80px]"
                  >
                    {pendingId === piece.id ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      t("markDone")
                    )}
                  </Button>
                )}

                {errorMap[piece.id] && (
                  <p className="text-xs text-destructive shrink-0">{errorMap[piece.id]}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Unassigned / claimable pieces */}
      {available.length > 0 && (
        <section>
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("available")}
          </p>
          <ul className="divide-y divide-border">
            {available.map((piece) => (
              <li
                key={piece.id}
                className="flex items-center justify-between gap-3 px-4 py-4 min-h-[64px]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <PlusCircleIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{piece.clothPieceName}</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClaim(piece)}
                  disabled={pendingId === piece.id}
                  className="shrink-0 min-w-[80px]"
                >
                  {pendingId === piece.id ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    t("claim")
                  )}
                </Button>

                {errorMap[piece.id] && (
                  <p className="text-xs text-destructive shrink-0">{errorMap[piece.id]}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
