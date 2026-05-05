"use client";

import { useTranslations } from "next-intl";
import { Trash2Icon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

export type OrderLine = {
  key: number;
  clothPieceId: string;
  clothPieceVariantId: string;
  quantity: number;
  unitPrice: number;
  itemDescription: string;
  color: string;
  style: string;
  size: string;
  instructions: string;
};

export function buildDescription(lines: OrderLine[], clothPieces: ClothPieceRow[]): string {
  return lines
    .filter((l) => l.clothPieceId && l.clothPieceVariantId)
    .map((l) => {
      const piece = clothPieces.find((p) => p.id === l.clothPieceId);
      const variant = piece?.variants.find((v) => v.id === l.clothPieceVariantId);
      const pieceName = piece?.name ?? "";
      const variantName = variant?.name ?? "";
      const label =
        variantName && variantName !== "Standard" ? `${pieceName} (${variantName})` : pieceName;
      const desc = l.itemDescription.trim();
      return `${l.quantity}x ${label}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
}

export function parseDescription(description: string): Array<{ label: string; notes: string }> {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const dashIdx = line.indexOf(" — ");
      if (dashIdx !== -1) {
        return { label: line.slice(0, dashIdx), notes: line.slice(dashIdx + 3) };
      }
      return { label: line, notes: "" };
    });
}

export function LineAccordion({
  line,
  index,
  open,
  onToggle,
  onRemove,
  onUpdate,
  clothPieces,
  canRemove,
  hasError,
}: {
  line: OrderLine;
  index: number;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<OrderLine, "key">>) => void;
  clothPieces: ClothPieceRow[];
  canRemove: boolean;
  hasError: boolean;
}) {
  const t = useTranslations("largeOrders");
  const piece = clothPieces.find((p) => p.id === line.clothPieceId);
  const activeVariants = piece?.variants.filter((v) => v.isActive) ?? [];
  const variant = activeVariants.find((v) => v.id === line.clothPieceVariantId);
  const lineTotal = line.unitPrice * line.quantity;

  const summaryLabel = piece
    ? `${line.quantity}x ${piece.name}${variant ? ` (${variant.name})` : ""}`
    : `${t("item")} ${index + 1}`;

  return (
    <div
      className={cn("rounded-md border", hasError && "border-destructive", open && "border-ring")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium truncate block">{summaryLabel}</span>
          {!open && line.itemDescription && (
            <span className="text-xs text-muted-foreground truncate block">
              {line.itemDescription}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 ml-2">
          {lineTotal > 0 && !open && (
            <span className="text-xs font-mono text-muted-foreground">
              ${lineTotal.toLocaleString("es-CO")}
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("selectPiece")}
              </label>
              <select
                aria-label={t("selectPiece")}
                value={line.clothPieceId}
                onChange={(e) => onUpdate({ clothPieceId: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="">{t("selectPiece")}</option>
                {clothPieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("selectVariant")}
              </label>
              <select
                aria-label={t("selectVariant")}
                value={line.clothPieceVariantId}
                onChange={(e) => onUpdate({ clothPieceVariantId: e.target.value })}
                disabled={!line.clothPieceId || activeVariants.length === 0}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:border-ring disabled:opacity-50"
              >
                <option value="">
                  {line.clothPieceId && activeVariants.length === 0
                    ? t("noVariants")
                    : t("selectVariant")}
                </option>
                {activeVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("quantity")}</label>
              <input
                type="number"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) =>
                  onUpdate({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("unitPrice")}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={line.unitPrice}
                onChange={(e) => onUpdate({ unitPrice: parseInt(e.target.value, 10) || 0 })}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("itemDescription")} <span className="text-destructive">*</span>
            </label>
            <textarea
              rows={2}
              maxLength={300}
              required
              value={line.itemDescription}
              onChange={(e) => onUpdate({ itemDescription: e.target.value })}
              placeholder={t("itemDescriptionPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("color")}</label>
              <input
                type="text"
                aria-label={t("color")}
                value={line.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
                maxLength={80}
                placeholder={t("colorPlaceholder")}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("style")}</label>
              <input
                type="text"
                aria-label={t("style")}
                value={line.style}
                onChange={(e) => onUpdate({ style: e.target.value })}
                maxLength={80}
                placeholder={t("stylePlaceholder")}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("size")}</label>
              <input
                type="text"
                aria-label={t("size")}
                value={line.size}
                onChange={(e) => onUpdate({ size: e.target.value })}
                maxLength={40}
                placeholder={t("sizePlaceholder")}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("instructions")}</label>
            <input
              type="text"
              aria-label={t("instructions")}
              value={line.instructions}
              onChange={(e) => onUpdate({ instructions: e.target.value })}
              maxLength={500}
              placeholder={t("instructionsPlaceholder")}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
            />
          </div>

          <div className="flex items-center justify-between">
            {lineTotal > 0 && (
              <span className="text-sm font-mono font-semibold">
                ${lineTotal.toLocaleString("es-CO")}
              </span>
            )}
            <button
              type="button"
              onClick={onRemove}
              disabled={!canRemove}
              aria-label={t("removeItem")}
              className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-30"
            >
              <Trash2Icon className="size-3.5" />
              {t("removeItem")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
