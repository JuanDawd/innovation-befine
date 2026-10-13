"use client";

import { notifyDataChanged } from "@/lib/data-events";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import {
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  PlusCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "sonner";
import { newUuid } from "@/lib/uuid";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductProgressBar } from "@/components/ui/product-progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  claimPiece,
  markPieceDone,
  type ProductPieceRow,
} from "@/app/(protected)/clothier/actions";
import { fetchQuery } from "@/lib/action-query";

// ─── Per-piece notes (collapsible) ───────────────────────────────────────────

function PieceNotes({ piece }: { piece: ProductPieceRow }) {
  const t = useTranslations("clothierWork");
  const [open, setOpen] = useState(false);
  const hasNotes = piece.color || piece.style || piece.size || piece.instructions;

  if (!hasNotes) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        className="-ml-2 flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronUpIcon className="size-4" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        )}
        {t("viewNotes")}
      </button>
      {open && (
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          {piece.color && (
            <>
              <dt className="text-muted-foreground">{t("color")}</dt>
              <dd>{piece.color}</dd>
            </>
          )}
          {piece.style && (
            <>
              <dt className="text-muted-foreground">{t("style")}</dt>
              <dd>{piece.style}</dd>
            </>
          )}
          {piece.size && (
            <>
              <dt className="text-muted-foreground">{t("size")}</dt>
              <dd>{piece.size}</dd>
            </>
          )}
          {piece.instructions && (
            <>
              <dt className="text-muted-foreground">{t("instructions")}</dt>
              <dd className="col-span-1">{piece.instructions}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

// ─── Piece status badge ───────────────────────────────────────────────────────

function PieceStatusBadge({ status }: { status: ProductPieceRow["status"] }) {
  const t = useTranslations("clothierWork");
  if (status === "approved") return <StatusBadge status="success" label={t("statusApproved")} />;
  if (status === "done_pending_approval")
    return <StatusBadge status="attention" label={t("statusPendingApproval")} />;
  return null;
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function ClothierWorkBoard({ employeeId }: { employeeId: string }) {
  const t = useTranslations("clothierWork");

  const { data: pieces = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.products.clothierBoard,
    queryFn: () => fetchQuery("todayProductPieces"),
    refetchInterval: 30_000,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const myPieces = pieces.filter((p) => p.assignedToEmployeeId === employeeId);
  const available = pieces.filter((p) => p.assignedToEmployeeId === null);

  const doneCount = myPieces.filter(
    (p) => p.status === "done_pending_approval" || p.status === "approved",
  ).length;
  const totalMine = myPieces.length;

  async function handleClaim(piece: ProductPieceRow) {
    setPendingId(piece.id);
    const res = await claimPiece(piece.id, piece.version);
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({ ...m, [piece.id]: t("claimError") }));
    } else {
      toast.success(t("claimSuccess", { piece: piece.clothPieceName }));
      notifyDataChanged("products");
    }
  }

  async function handleMarkDone(piece: ProductPieceRow) {
    setPendingId(piece.id);
    const res = await markPieceDone(piece.id, piece.version, newUuid());
    setPendingId(null);
    if (!res.success) {
      setErrorMap((m) => ({
        ...m,
        [piece.id]: res.error.code === "STALE_DATA" ? t("staleError") : t("markDoneError"),
      }));
    } else {
      toast.success(t("markDoneSuccess", { piece: piece.clothPieceName }));
      notifyDataChanged("products");
    }
  }

  if (isLoading && pieces.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (myPieces.length === 0 && available.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2Icon}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
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
          <ProductProgressBar
            pct={totalMine > 0 ? Math.round((doneCount / totalMine) * 100) : 0}
            showLabel={false}
            className="w-full"
          />
        </div>
      )}

      {/* My assigned pieces */}
      {myPieces.length > 0 && (
        <section>
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("myPieces")}
          </p>
          <ul className="divide-y divide-border">
            {myPieces.map((piece) => {
              const isDone = piece.status !== "pending";
              return (
                <li
                  key={piece.id}
                  className="flex items-start justify-between gap-3 px-4 py-4 min-h-[64px]"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {isDone ? (
                      <CheckCircle2Icon className="size-5 shrink-0 text-status-success-foreground mt-0.5" />
                    ) : (
                      <CircleIcon className="size-5 shrink-0 text-muted-foreground mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-medium truncate ${
                            isDone ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {piece.clothPieceName}
                        </span>
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
                          ×{piece.quantity}
                        </span>
                        {isDone && <PieceStatusBadge status={piece.status} />}
                      </div>
                      <PieceNotes piece={piece} />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {piece.status === "pending" && (
                      <ConfirmationDialog
                        trigger={
                          <Button
                            size="sm"
                            disabled={pendingId === piece.id}
                            className="min-w-[80px]"
                          >
                            {pendingId === piece.id ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              t("markDone")
                            )}
                          </Button>
                        }
                        title={t("markDoneConfirmTitle", {
                          piece: piece.clothPieceName,
                          quantity: piece.quantity,
                        })}
                        description={t("markDoneConfirmDescription")}
                        confirmLabel={t("markDone")}
                        cancelLabel={t("cancel")}
                        onConfirm={() => handleMarkDone(piece)}
                      />
                    )}
                    {errorMap[piece.id] && (
                      <p className="text-xs text-destructive">{errorMap[piece.id]}</p>
                    )}
                  </div>
                </li>
              );
            })}
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
                className="flex items-start justify-between gap-3 px-4 py-4 min-h-[64px]"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <PlusCircleIcon className="size-5 shrink-0 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{piece.clothPieceName}</span>
                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
                        ×{piece.quantity}
                      </span>
                    </div>
                    <PieceNotes piece={piece} />
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleClaim(piece)}
                    disabled={pendingId === piece.id}
                    className="min-w-[80px]"
                  >
                    {pendingId === piece.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      t("claim")
                    )}
                  </Button>
                  {errorMap[piece.id] && (
                    <p className="text-xs text-destructive">{errorMap[piece.id]}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
