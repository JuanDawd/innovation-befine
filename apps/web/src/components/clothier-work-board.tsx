"use client";

import { notifyDataChanged } from "@/lib/data-events";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useFormatter, useTranslations } from "next-intl";
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
  const format = useFormatter();

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
      if (res.error.code === "CONFLICT") {
        // M-58: someone else got it — drop it from the list instead of
        // leaving a dead row to tap again.
        toast.info(t("claimTaken", { piece: piece.clothPieceName }));
        notifyDataChanged("products");
      } else {
        setErrorMap((m) => ({ ...m, [piece.id]: res.error.message }));
      }
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
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
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

  const toDo = myPieces.filter((p) => p.status === "pending");
  const done = myPieces.filter((p) => p.status !== "pending");

  const sectionHeading = (id: string, label: string, count: number) => (
    <h2 id={id} className="mb-1 flex items-baseline gap-2 px-4 text-lg font-semibold">
      {label}
      <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
    </h2>
  );

  const pieceTitle = (piece: ProductPieceRow) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="truncate text-sm font-medium">{piece.clothPieceName}</span>
      <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums">
        ×{piece.quantity}
      </span>
      {piece.carriedOver && (
        <span className="text-xs text-status-attention-foreground">
          {t("fromDate", {
            date: format.dateTime(new Date(`${piece.productDate}T12:00:00-05:00`), {
              day: "numeric",
              month: "short",
              timeZone: "America/Bogota",
            }),
          })}
        </span>
      )}
    </div>
  );

  const pieceError = (piece: ProductPieceRow) =>
    errorMap[piece.id] && (
      <p className="text-xs text-destructive" role="alert">
        {errorMap[piece.id]}
      </p>
    );

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Progress */}
      {totalMine > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-4">
          <p
            className={
              toDo.length === 0
                ? "flex items-center gap-1.5 text-sm font-medium text-status-success-foreground"
                : "text-sm text-muted-foreground"
            }
          >
            {toDo.length === 0 && <CheckCircle2Icon className="size-4" aria-hidden="true" />}
            {toDo.length === 0
              ? t("allDone")
              : t("progress", { done: doneCount, total: totalMine })}
          </p>
          <ProductProgressBar
            pct={Math.round((doneCount / totalMine) * 100)}
            showLabel={false}
            className="w-full"
          />
        </div>
      )}

      {/* To do: my pending pieces */}
      {toDo.length > 0 && (
        <section aria-labelledby="pieces-todo">
          {sectionHeading("pieces-todo", t("groupToDo"), toDo.length)}
          <ul className="divide-y divide-border">
            {toDo.map((piece) => (
              <li key={piece.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start gap-3">
                  <CircleIcon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    {pieceTitle(piece)}
                    <PieceNotes piece={piece} />
                  </div>
                </div>
                <ConfirmationDialog
                  trigger={
                    <Button className="h-11 w-full gap-1.5" disabled={pendingId === piece.id}>
                      {pendingId === piece.id ? (
                        <Loader2Icon className="animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2Icon aria-hidden="true" />
                      )}
                      {t("markDone")}
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
                {pieceError(piece)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Unassigned / claimable pieces */}
      {available.length > 0 && (
        <section aria-labelledby="pieces-available">
          {sectionHeading("pieces-available", t("available"), available.length)}
          <ul className="divide-y divide-border">
            {available.map((piece) => (
              <li key={piece.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start gap-3">
                  <PlusCircleIcon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    {pieceTitle(piece)}
                    <PieceNotes piece={piece} />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleClaim(piece)}
                  disabled={pendingId === piece.id}
                  className="h-11 w-full gap-1.5"
                >
                  {pendingId === piece.id ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : (
                    <PlusCircleIcon aria-hidden="true" />
                  )}
                  {t("claim")}
                </Button>
                {pieceError(piece)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Finished: done and awaiting approval, or approved */}
      {done.length > 0 && (
        <section aria-labelledby="pieces-done">
          {sectionHeading("pieces-done", t("groupDone"), done.length)}
          <ul className="divide-y divide-border">
            {done.map((piece) => (
              <li key={piece.id} className="flex items-start gap-3 px-4 py-3">
                <CheckCircle2Icon
                  className="mt-0.5 size-5 shrink-0 text-status-success-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {pieceTitle(piece)}
                    <PieceStatusBadge status={piece.status} />
                  </div>
                  <PieceNotes piece={piece} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
