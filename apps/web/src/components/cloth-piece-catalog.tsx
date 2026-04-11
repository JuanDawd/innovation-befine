"use client";

/**
 * ClothPieceCatalog — T027
 *
 * Admin-only component to manage cloth piece types and their rates.
 */

import React, { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { PlusIcon, PencilIcon, TrashIcon, RotateCcwIcon, Loader2Icon } from "lucide-react";
import { createClothPieceSchema } from "@befine/types";
import type { CreateClothPieceInput } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CatalogAuditLog } from "@/components/catalog-audit-log";
import {
  createClothPiece,
  editClothPiece,
  deactivateClothPiece,
  restoreClothPiece,
} from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

// ─── Create / Edit dialog (shared) ───────────────────────────────────────────

type PieceDialogMode = { mode: "create" } | { mode: "edit"; piece: ClothPieceRow };

function PieceDialog({
  config,
  trigger,
  onSuccess,
}: {
  config: PieceDialogMode;
  trigger: React.ReactNode;
  onSuccess: (piece: ClothPieceRow) => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = config.mode === "edit";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateClothPieceInput>({
    resolver: zodResolver(createClothPieceSchema),
  });

  function handleOpen() {
    reset(
      isEdit
        ? {
            name: config.piece.name,
            description: config.piece.description ?? "",
            pieceRate: config.piece.pieceRate,
          }
        : { name: "", description: "", pieceRate: 0 },
    );
    setServerError(null);
    setOpen(true);
  }

  async function onSubmit(data: CreateClothPieceInput) {
    startTransition(async () => {
      const result = isEdit
        ? await editClothPiece(config.piece.id, data)
        : await createClothPiece(data);

      if (result.success) {
        setOpen(false);
        const piece: ClothPieceRow = isEdit
          ? {
              ...config.piece,
              name: data.name,
              description: data.description ?? null,
              pieceRate: data.pieceRate,
              updatedAt: new Date(),
            }
          : {
              id: result.data.id,
              name: data.name,
              description: data.description ?? null,
              pieceRate: data.pieceRate,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
        onSuccess(piece);
      } else {
        setServerError(result.error.message);
      }
    });
  }

  const title = isEdit ? t("editClothPiece") : t("createClothPiece");

  return (
    <>
      {React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: handleOpen,
          })
        : trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <form id="piece-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {serverError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {serverError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="piece-name" className="text-sm font-medium">
                {t("clothPieceName")}
              </label>
              <Input
                id="piece-name"
                placeholder={t("clothPieceNamePlaceholder")}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="piece-desc" className="text-sm font-medium">
                {t("clothPieceDescription")}{" "}
                <span className="text-muted-foreground">{tc("optional")}</span>
              </label>
              <Input
                id="piece-desc"
                placeholder={t("clothPieceDescriptionPlaceholder")}
                {...register("description")}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="piece-rate" className="text-sm font-medium">
                {t("pieceRateLabel")}
              </label>
              <Input
                id="piece-rate"
                type="number"
                min={0}
                placeholder={t("pieceRatePlaceholder")}
                aria-invalid={!!errors.pieceRate}
                {...register("pieceRate", { valueAsNumber: true })}
              />
              {errors.pieceRate && (
                <p className="text-sm text-destructive">{errors.pieceRate.message}</p>
              )}
            </div>
          </form>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button type="submit" form="piece-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {isEdit ? tc("save") : tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Piece Row ────────────────────────────────────────────────────────────────

function PieceRow({
  piece,
  onChange,
}: {
  piece: ClothPieceRow;
  onChange: (updated: ClothPieceRow) => void;
}) {
  const t = useTranslations("catalog");
  const [localPiece, setLocalPiece] = useState(piece);
  const [isPending, startTransition] = useTransition();

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateClothPiece(localPiece.id);
      if (result.success) {
        const updated = { ...localPiece, isActive: false };
        setLocalPiece(updated);
        onChange(updated);
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreClothPiece(localPiece.id);
      if (result.success) {
        const updated = { ...localPiece, isActive: true };
        setLocalPiece(updated);
        onChange(updated);
      }
    });
  }

  return (
    <div className={`rounded-xl border ${localPiece.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{localPiece.name}</p>
            {!localPiece.isActive && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("inactive")}
              </span>
            )}
          </div>
          {localPiece.description && (
            <p className="text-xs text-muted-foreground">{localPiece.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono tabular-nums text-sm">{formatCOP(localPiece.pieceRate)}</span>

          <PieceDialog
            config={{ mode: "edit", piece: localPiece }}
            trigger={
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                <PencilIcon className="size-4" aria-label={t("editClothPiece")} />
              </span>
            }
            onSuccess={(updated) => {
              setLocalPiece(updated);
              onChange(updated);
            }}
          />

          {localPiece.isActive ? (
            <ConfirmationDialog
              trigger={
                <button
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("deactivate")}
                  disabled={isPending}
                >
                  <TrashIcon className="size-4" />
                </button>
              }
              title={t("deactivateClothPieceConfirm", { name: localPiece.name })}
              description={t("deactivateClothPieceDescription")}
              confirmLabel={t("deactivate")}
              variant="destructive"
              onConfirm={handleDeactivate}
            />
          ) : (
            <button
              onClick={handleRestore}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("restore")}
            >
              <RotateCcwIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <CatalogAuditLog entityId={localPiece.id} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClothPieceCatalog({ initialPieces }: { initialPieces: ClothPieceRow[] }) {
  const t = useTranslations("catalog");
  const [pieces, setPieces] = useState<ClothPieceRow[]>(initialPieces);
  const [showInactive, setShowInactive] = useState(false);

  const visible = showInactive ? pieces : pieces.filter((p) => p.isActive);

  function handleCreated(piece: ClothPieceRow) {
    setPieces((prev) => [...prev, piece]);
  }

  function handleChanged(updated: ClothPieceRow) {
    setPieces((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-muted-foreground/30"
          />
          {t("showInactive")}
        </label>

        <PieceDialog
          config={{ mode: "create" }}
          trigger={
            <Button size="sm" className="gap-1.5">
              <PlusIcon className="size-4" aria-hidden="true" />
              {t("createClothPiece")}
            </Button>
          }
          onSuccess={handleCreated}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t("emptyClothPiecesTitle")}
          description={t("emptyClothPiecesDescription")}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((piece) => (
            <PieceRow key={piece.id} piece={piece} onChange={handleChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
