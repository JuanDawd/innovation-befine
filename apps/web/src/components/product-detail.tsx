"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProductStatusBadge, type ProductStatusKey } from "@/components/ui/product-status-badge";
import { ProductProgressBar } from "@/components/ui/product-progress-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateProductPiece } from "@/app/(protected)/products/actions";
import { updateProductPieceSchema, type UpdateProductPieceInput } from "@befine/types";
import type { ProductDetailRow, ProductPieceDetailRow } from "@befine/db";

// ─── Piece status mapping ─────────────────────────────────────────────────────

function pieceBadgeStatus(status: ProductPieceDetailRow["status"]): string {
  switch (status) {
    case "pending":
      return "initial";
    case "done_pending_approval":
      return "attention";
    case "approved":
      return "success";
  }
}

function deriveProductStatus(pieces: ProductPieceDetailRow[]): ProductStatusKey {
  if (pieces.length === 0) return "not_started";
  const approved = pieces.filter((p) => p.status === "approved").length;
  const pending = pieces.filter((p) => p.status === "pending").length;
  if (approved >= pieces.length) return "all_approved";
  if (pending < pieces.length - approved) return "pending_approval";
  if (approved > 0) return "in_progress";
  return "not_started";
}

function productProgressPct(pieces: ProductPieceDetailRow[]): number {
  if (pieces.length === 0) return 0;
  const approved = pieces.filter((p) => p.status === "approved").length;
  return Math.round((approved / pieces.length) * 100);
}

// ─── Collapsible notes ────────────────────────────────────────────────────────

function PieceNotes({ piece }: { piece: ProductPieceDetailRow }) {
  const t = useTranslations("products");
  const [open, setOpen] = useState(false);
  const hasNotes = piece.color || piece.style || piece.size || piece.instructions;

  if (!hasNotes) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
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

// ─── Edit piece dialog ────────────────────────────────────────────────────────

type EditDialogProps = {
  piece: ProductPieceDetailRow;
  onSaved: () => void;
};

function EditPieceDialog({ piece, onSaved }: EditDialogProps) {
  const t = useTranslations("products");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProductPieceInput>({
    resolver: zodResolver(updateProductPieceSchema),
    defaultValues: {
      id: piece.id,
      version: piece.version,
      quantity: piece.quantity,
      color: piece.color ?? undefined,
      style: piece.style ?? undefined,
      size: piece.size ?? undefined,
      instructions: piece.instructions ?? undefined,
    },
  });

  function onOpenChange(v: boolean) {
    if (!v) reset();
    setServerError(null);
    setOpen(v);
  }

  function onSubmit(data: UpdateProductPieceInput) {
    setServerError(null);
    startTransition(async () => {
      const res = await updateProductPiece(data);
      if (!res.success) {
        setServerError(res.error.code === "STALE_DATA" ? t("staleError") : t("editPieceError"));
        return;
      }
      setOpen(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("editPiece")}
      >
        <PencilIcon className="size-3.5" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editPiece")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input type="hidden" {...register("id")} />
          <input type="hidden" {...register("version", { valueAsNumber: true })} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="ep-quantity">
              {t("quantity")}
            </label>
            <input
              id="ep-quantity"
              type="number"
              min={1}
              max={999}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
              aria-describedby={errors.quantity ? "ep-quantity-err" : undefined}
              {...register("quantity", { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p id="ep-quantity-err" className="text-xs text-destructive">
                {errors.quantity.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="ep-color">
              {t("color")} <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="ep-color"
              type="text"
              placeholder={t("colorPlaceholder")}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
              {...register("color")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="ep-style">
              {t("style")} <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="ep-style"
              type="text"
              placeholder={t("stylePlaceholder")}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
              {...register("style")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="ep-size">
              {t("size")} <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="ep-size"
              type="text"
              placeholder={t("sizePlaceholder")}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
              {...register("size")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="ep-instructions">
              {t("instructions")}{" "}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              id="ep-instructions"
              rows={3}
              placeholder={t("instructionsPlaceholder")}
              className="rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
              {...register("instructions")}
            />
          </div>

          {serverError && <p className="text-xs text-destructive">{serverError}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isPending} size="sm">
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main detail component ────────────────────────────────────────────────────

type Props = {
  initialData: ProductDetailRow;
  isEditor: boolean;
  backHref: string;
};

export function ProductDetail({ initialData, isEditor, backHref }: Props) {
  const t = useTranslations("products");
  const [data, setData] = useState<ProductDetailRow>(initialData);
  const [isPending, startTransition] = useTransition();

  async function reload() {
    const { getProductDetailData } = await import("@/app/(protected)/products/actions");
    startTransition(async () => {
      const res = await getProductDetailData(data.id);
      if (res.success) setData(res.data);
    });
  }

  const openedDate = new Date(data.businessDayOpenedAt).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const productStatus = deriveProductStatus(data.pieces);
  const progressPct = productProgressPct(data.pieces);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("back")}
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">{t("detailTitle")}</h1>
        <ProductStatusBadge status={productStatus} />
      </div>

      {data.pieces.length > 0 && <ProductProgressBar pct={progressPct} className="max-w-xs" />}

      {/* Product metadata */}
      <div className="rounded-lg border border-border p-4 text-sm flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <span className="text-muted-foreground">{t("colBusinessDay")}: </span>
          <span>{openedDate}</span>
        </div>
        {data.largeOrderClientName && (
          <div>
            <span className="text-muted-foreground">{t("colLargeOrder")}: </span>
            <span>{data.largeOrderClientName}</span>
          </div>
        )}
        {data.notes && (
          <div className="w-full">
            <span className="text-muted-foreground">{t("notes")}: </span>
            <span>{data.notes}</span>
          </div>
        )}
      </div>

      {/* Pieces table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" aria-busy={isPending}>
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">{t("colPiece")}</th>
              <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">
                {t("colClothier")}
              </th>
              <th className="px-3 py-2.5 text-right font-medium font-mono">{t("colQuantity")}</th>
              <th className="px-3 py-2.5 text-left font-medium">{t("colStatus")}</th>
              {isEditor && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.pieces.map((piece) => (
              <tr key={piece.id} className="hover:bg-muted/30 align-top">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{piece.clothPieceName}</div>
                  <div className="text-xs text-muted-foreground">{piece.clothPieceVariantName}</div>
                  <PieceNotes piece={piece} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                  {piece.assignedEmployeeName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                    ×{piece.quantity}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={pieceBadgeStatus(piece.status)} />
                </td>
                {isEditor && (
                  <td className="px-3 py-2.5">
                    <EditPieceDialog piece={piece} onSaved={reload} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
