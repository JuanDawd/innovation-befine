"use client";

/**
 * ClothPieceCatalog — T027 (updated for cloth_piece_variants)
 *
 * Each cloth piece is a garment family (name/description).
 * Variants (e.g. "Dos piezas", "Entera") hold the piece_rate.
 * Admin manages variants inline under each piece.
 */

import React, { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  RotateCcwIcon,
  Loader2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { createClothPieceSchema } from "@befine/types";
import type { CreateClothPieceInput } from "@befine/types";
import { z } from "zod";
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
import type {
  ClothPieceRow,
  ClothPieceVariantRow,
} from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CatalogAuditLog } from "@/components/catalog-audit-log";
import {
  createClothPiece,
  editClothPiece,
  deactivateClothPiece,
  restoreClothPiece,
  createClothPieceVariant,
  editClothPieceVariant,
  deactivateClothPieceVariant,
  restoreClothPieceVariant,
} from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

// ─── Variant form schema ──────────────────────────────────────────────────────

const variantSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  pieceRate: z.number().int().min(0, "La tarifa no puede ser negativa"),
  sellingPrice: z.number().int().min(0, "El precio no puede ser negativo").nullable().optional(),
});
type VariantInput = z.infer<typeof variantSchema>;

// ─── Variant row ──────────────────────────────────────────────────────────────

function VariantRow({
  variant,
  onUpdated,
}: {
  variant: ClothPieceVariantRow;
  onUpdated: (v: ClothPieceVariantRow) => void;
}) {
  const t = useTranslations("catalog");
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VariantInput>({
    resolver: zodResolver(variantSchema),
  });

  function openEdit() {
    reset({
      name: variant.name,
      pieceRate: variant.pieceRate,
      sellingPrice: variant.sellingPrice ?? undefined,
    });
    setServerError(null);
    setEditOpen(true);
  }

  function onSubmit(data: VariantInput) {
    startTransition(async () => {
      const res = await editClothPieceVariant(variant.id, data);
      if (res.success) {
        showToast("success", t("editVariantSuccess"));
        onUpdated(res.data);
        setEditOpen(false);
      } else {
        setServerError(res.error.message);
      }
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      const res = await deactivateClothPieceVariant(variant.id);
      if (res.success) {
        showToast("success", t("deactivateSuccess"));
        onUpdated({ ...variant, isActive: false });
      } else {
        showToast("error", t("deactivateError"));
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreClothPieceVariant(variant.id);
      if (res.success) {
        showToast("success", t("restoreSuccess"));
        onUpdated({ ...variant, isActive: true });
      } else {
        showToast("error", t("restoreError"));
      }
    });
  }

  return (
    <>
      <div
        className={`flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/30 ${!variant.isActive ? "opacity-50" : ""}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm truncate">{variant.name}</span>
          {!variant.isActive && (
            <span className="text-xs text-muted-foreground">{t("inactive")}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="font-mono tabular-nums text-xs text-muted-foreground"
            title="Tarifa costurera"
          >
            {formatCOP(variant.pieceRate)}
          </span>
          {variant.sellingPrice != null && (
            <span className="font-mono tabular-nums text-xs font-medium" title="Precio de venta">
              {formatCOP(variant.sellingPrice)}
            </span>
          )}
          <button
            onClick={openEdit}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("editVariant")}
          >
            <PencilIcon className="size-3.5" />
          </button>
          {variant.isActive ? (
            <ConfirmationDialog
              trigger={
                <button
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("deactivate")}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              }
              title={t("deactivateVariantConfirm", { name: variant.name })}
              description={t("deactivateVariantDescription")}
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
              <RotateCcwIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editVariant")}</DialogTitle>
          </DialogHeader>
          <form
            id="variant-edit-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            {serverError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {serverError}
              </p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="ve-name" className="text-sm font-medium">
                {t("variantName")}
              </label>
              <Input id="ve-name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ve-rate" className="text-sm font-medium">
                {t("pieceRateLabel")}
              </label>
              <Input
                id="ve-rate"
                type="number"
                min={0}
                aria-invalid={!!errors.pieceRate}
                {...register("pieceRate", { valueAsNumber: true })}
              />
              {errors.pieceRate && (
                <p className="text-sm text-destructive">{errors.pieceRate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ve-selling-price" className="text-sm font-medium">
                {t("sellingPriceLabel")}{" "}
                <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <Input
                id="ve-selling-price"
                type="number"
                min={0}
                placeholder="0"
                aria-invalid={!!errors.sellingPrice}
                {...register("sellingPrice", {
                  setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
                })}
              />
              {errors.sellingPrice && (
                <p className="text-sm text-destructive">{errors.sellingPrice.message}</p>
              )}
            </div>
          </form>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {useTranslations("common")("cancel")}
            </DialogClose>
            <Button type="submit" form="variant-edit-form" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {useTranslations("common")("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Add variant form (inline) ────────────────────────────────────────────────

function AddVariantForm({
  clothPieceId,
  onCreated,
  onCancel,
}: {
  clothPieceId: string;
  onCreated: (v: ClothPieceVariantRow) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("catalog");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VariantInput>({
    resolver: zodResolver(variantSchema),
    defaultValues: { name: "", pieceRate: 0 },
  });

  function onSubmit(data: VariantInput) {
    startTransition(async () => {
      const res = await createClothPieceVariant(clothPieceId, data);
      if (res.success) {
        showToast("success", t("addVariantSuccess"));
        onCreated(res.data);
      } else {
        setServerError(res.error.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-2 pt-1">
      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-32 space-y-1">
          <Input
            placeholder={t("variantNamePlaceholder")}
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="w-32 space-y-1">
          <Input
            type="number"
            min={0}
            placeholder={t("pieceRatePlaceholder")}
            aria-invalid={!!errors.pieceRate}
            {...register("pieceRate", { valueAsNumber: true })}
          />
          {errors.pieceRate && (
            <p className="text-xs text-destructive">{errors.pieceRate.message}</p>
          )}
        </div>
        <div className="w-32 space-y-1">
          <Input
            type="number"
            min={0}
            placeholder={t("sellingPricePlaceholder")}
            aria-invalid={!!errors.sellingPrice}
            {...register("sellingPrice", {
              setValueAs: (v) => (v === "" || v === null ? null : Number(v)),
            })}
          />
          {errors.sellingPrice && (
            <p className="text-xs text-destructive">{errors.sellingPrice.message}</p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2Icon className="size-4 animate-spin" /> : tc("add")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}

// ─── Piece dialog (create / edit) ─────────────────────────────────────────────

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
  const { showToast } = useToast();
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
        ? { name: config.piece.name, description: config.piece.description ?? "" }
        : { name: "", description: "" },
    );
    setServerError(null);
    setOpen(true);
  }

  function onSubmit(data: CreateClothPieceInput) {
    startTransition(async () => {
      const result = isEdit
        ? await editClothPiece(config.piece.id, data)
        : await createClothPiece(data);
      if (result.success) {
        showToast("success", isEdit ? t("editClothPieceSuccess") : t("createClothPieceSuccess"));
        setOpen(false);
        const piece: ClothPieceRow = isEdit
          ? {
              ...config.piece,
              name: data.name,
              description: data.description ?? null,
              updatedAt: new Date(),
            }
          : {
              id: result.data.id,
              name: data.name,
              description: data.description ?? null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              variants: [],
            };
        onSuccess(piece);
      } else {
        setServerError(result.error.message);
      }
    });
  }

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
            <DialogTitle>{isEdit ? t("editClothPiece") : t("createClothPiece")}</DialogTitle>
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

// ─── Piece row with variants ──────────────────────────────────────────────────

function PieceRow({
  piece,
  onChange,
}: {
  piece: ClothPieceRow;
  onChange: (updated: ClothPieceRow) => void;
}) {
  const t = useTranslations("catalog");
  const { showToast } = useToast();
  const [localPiece, setLocalPiece] = useState(piece);
  const [expanded, setExpanded] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [isPending, startTransition] = useTransition();

  function update(next: ClothPieceRow) {
    setLocalPiece(next);
    onChange(next);
  }

  function handleDeactivate() {
    startTransition(async () => {
      const res = await deactivateClothPiece(localPiece.id);
      if (res.success) {
        showToast("success", t("deactivateSuccess"));
        update({ ...localPiece, isActive: false });
      } else {
        showToast("error", t("deactivateError"));
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreClothPiece(localPiece.id);
      if (res.success) {
        showToast("success", t("restoreSuccess"));
        update({ ...localPiece, isActive: true });
      } else {
        showToast("error", t("restoreError"));
      }
    });
  }

  return (
    <div className={`rounded-xl border ${localPiece.isActive ? "" : "opacity-60"}`}>
      {/* Piece header */}
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{localPiece.name}</p>
            {!localPiece.isActive && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("inactive")}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {localPiece.variants.filter((v) => v.isActive).length} {t("variants")}
            </span>
          </div>
          {localPiece.description && (
            <p className="text-xs text-muted-foreground">{localPiece.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? t("collapseVariants") : t("expandVariants")}
          >
            {expanded ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </button>

          <PieceDialog
            config={{ mode: "edit", piece: localPiece }}
            trigger={
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                <PencilIcon className="size-4" aria-label={t("editClothPiece")} />
              </span>
            }
            onSuccess={(updated) => update({ ...updated, variants: localPiece.variants })}
          />

          {localPiece.isActive ? (
            <ConfirmationDialog
              trigger={
                <button
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("deactivate")}
                  disabled={isPending}
                >
                  <Trash2Icon className="size-4" />
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

      {/* Variants section */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t pt-3">
          <div className="space-y-1.5">
            {localPiece.variants.map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                onUpdated={(updated) =>
                  update({
                    ...localPiece,
                    variants: localPiece.variants.map((x) => (x.id === updated.id ? updated : x)),
                  })
                }
              />
            ))}
            {localPiece.variants.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">{t("noVariants")}</p>
            )}
          </div>

          {addingVariant ? (
            <AddVariantForm
              clothPieceId={localPiece.id}
              onCreated={(v) => {
                update({ ...localPiece, variants: [...localPiece.variants, v] });
                setAddingVariant(false);
              }}
              onCancel={() => setAddingVariant(false)}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setAddingVariant(true)}
            >
              <PlusIcon className="size-3.5" aria-hidden="true" />
              {t("addVariant")}
            </Button>
          )}
        </div>
      )}

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
          onSuccess={(piece) => setPieces((prev) => [...prev, piece])}
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
            <PieceRow
              key={piece.id}
              piece={piece}
              onChange={(updated) =>
                setPieces((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
