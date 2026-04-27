"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { PlusIcon, Trash2Icon, Loader2Icon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLargeOrder, type ClientOption } from "./actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

type Props = {
  clients: ClientOption[];
  clothPieces: ClothPieceRow[];
  canOverridePrice: boolean;
};

type OrderLine = {
  key: number;
  clothPieceId: string;
  clothPieceVariantId: string;
  quantity: number;
  unitPrice: number;
  itemDescription: string;
};

function buildDescription(lines: OrderLine[], clothPieces: ClothPieceRow[]): string {
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

function LineAccordion({
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
      {/* Accordion header */}
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

      {/* Accordion body */}
      {open && (
        <div className="border-t px-3 pb-3 pt-3 space-y-3 bg-muted/20">
          {/* Piece + variant */}
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

          {/* Qty + unit price */}
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

          {/* Item description — required */}
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

          {/* Line total + remove */}
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

export function CreateLargeOrderForm({ clients, clothPieces }: Props) {
  const t = useTranslations("largeOrders");
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [withDeposit, setWithDeposit] = useState(false);
  const [openKey, setOpenKey] = useState<number>(0);

  const [lines, setLines] = useState<OrderLine[]>([
    {
      key: 0,
      clothPieceId: "",
      clothPieceVariantId: "",
      quantity: 1,
      unitPrice: 0,
      itemDescription: "",
    },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const grandTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const generatedDescription = buildDescription(lines, clothPieces);

  function addLine() {
    const key = nextKey;
    setLines((prev) => [
      ...prev,
      {
        key,
        clothPieceId: "",
        clothPieceVariantId: "",
        quantity: 1,
        unitPrice: 0,
        itemDescription: "",
      },
    ]);
    setNextKey((k) => k + 1);
    setOpenKey(key);
  }

  function removeLine(key: number) {
    if (lines.length === 1) return;
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key);
      if (openKey === key) setOpenKey(next[next.length - 1].key);
      return next;
    });
  }

  function updateLine(key: number, patch: Partial<Omit<OrderLine, "key">>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        if (patch.clothPieceId !== undefined) {
          const piece = clothPieces.find((p) => p.id === patch.clothPieceId);
          const active = piece?.variants.filter((v) => v.isActive) ?? [];
          if (active.length === 1) {
            updated.clothPieceVariantId = active[0].id;
            updated.unitPrice = active[0].pieceRate;
          } else {
            updated.clothPieceVariantId = "";
            updated.unitPrice = 0;
          }
        }
        if (patch.clothPieceVariantId !== undefined) {
          const piece = clothPieces.find((p) => p.id === l.clothPieceId);
          const variant = piece?.variants.find((v) => v.id === patch.clothPieceVariantId);
          if (variant) updated.unitPrice = variant.pieceRate;
        }
        return updated;
      }),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validate: all items need piece + variant + description
    const incomplete = lines.some(
      (l) => !l.clothPieceId || !l.clothPieceVariantId || !l.itemDescription.trim(),
    );
    if (incomplete) {
      setError(t("itemsRequired"));
      return;
    }

    const fd = new FormData(e.currentTarget);
    const depositAmountRaw = fd.get("initialDepositAmount") as string;
    const depositAmount = depositAmountRaw ? parseInt(depositAmountRaw, 10) : undefined;

    const input = {
      clientId: fd.get("clientId") as string,
      description: generatedDescription || (fd.get("description") as string),
      totalPrice: grandTotal > 0 ? grandTotal : parseInt(fd.get("totalPrice") as string, 10),
      estimatedDeliveryAt: (fd.get("estimatedDeliveryAt") as string)
        ? `${fd.get("estimatedDeliveryAt") as string}:00-05:00`
        : undefined,
      notes: (fd.get("notes") as string) || undefined,
      initialDepositAmount: withDeposit ? depositAmount : undefined,
      initialDepositMethod: withDeposit
        ? (fd.get("initialDepositMethod") as "cash" | "card" | "transfer")
        : undefined,
    };

    startTransition(async () => {
      const res = await createLargeOrder(input);
      if (!res.success) {
        if (res.error.code === "VALIDATION_ERROR" && "details" in res.error) {
          const errs: Record<string, string> = {};
          (res.error as { details?: { field: string; message: string }[] }).details?.forEach(
            (d) => (errs[d.field] = d.message),
          );
          setFieldErrors(errs);
        } else {
          setError(res.error.message);
          showToast("error", res.error.message);
        }
        return;
      }
      showToast("success", t("createSuccess"));
      router.push(`/large-orders/${res.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Client */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="clientId">
          {t("client")} <span className="text-destructive">*</span>
        </label>
        <select
          id="clientId"
          name="clientId"
          required
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
        >
          <option value="">{t("clientPlaceholder")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ""}
            </option>
          ))}
        </select>
        {fieldErrors.clientId && <p className="text-xs text-destructive">{fieldErrors.clientId}</p>}
      </div>

      {/* Items — required, accordion */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t("items")} <span className="text-destructive">*</span>
        </p>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <LineAccordion
              key={line.key}
              line={line}
              index={index}
              open={openKey === line.key}
              onToggle={() => setOpenKey(openKey === line.key ? -1 : line.key)}
              onRemove={() => removeLine(line.key)}
              onUpdate={(patch) => updateLine(line.key, patch)}
              clothPieces={clothPieces}
              canRemove={lines.length > 1}
              hasError={false}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <PlusIcon className="size-4" />
          {t("addItem")}
        </Button>
      </div>

      {/* Grand total */}
      {grandTotal > 0 && (
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("grandTotal")}</span>
          <span className="font-mono font-semibold">${grandTotal.toLocaleString("es-CO")}</span>
        </div>
      )}

      {/* Auto-generated description preview */}
      {generatedDescription && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">{t("generatedDescription")}</p>
          <pre className="w-full rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs font-sans whitespace-pre-wrap text-muted-foreground">
            {generatedDescription}
          </pre>
        </div>
      )}

      {/* Total price — hidden if auto-computed, shown for manual override */}
      {grandTotal === 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="totalPrice">
            {t("totalPrice")} <span className="text-destructive">*</span>
          </label>
          <input
            id="totalPrice"
            name="totalPrice"
            type="number"
            required
            min={1}
            step={1}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
          />
          {fieldErrors.totalPrice && (
            <p className="text-xs text-destructive">{fieldErrors.totalPrice}</p>
          )}
        </div>
      )}
      {/* Hidden field so totalPrice is always in the form when computed */}
      {grandTotal > 0 && <input type="hidden" name="totalPrice" value={grandTotal} />}

      {/* ETA */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="estimatedDeliveryAt">
          {t("estimatedDelivery")}
          <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
        </label>
        <input
          id="estimatedDeliveryAt"
          name="estimatedDeliveryAt"
          type="datetime-local"
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="notes">
          {t("notes")}
          <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={1000}
          rows={2}
          placeholder={t("notesPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
        />
      </div>

      {/* Initial deposit toggle */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={withDeposit}
            onChange={(e) => setWithDeposit(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm font-medium">{t("initialDeposit")}</span>
        </label>

        {withDeposit && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="initialDepositAmount">
                {t("depositAmount")}
              </label>
              <input
                id="initialDepositAmount"
                name="initialDepositAmount"
                type="number"
                min={1}
                step={1}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="initialDepositMethod">
                {t("depositMethod")}
              </label>
              <select
                id="initialDepositMethod"
                name="initialDepositMethod"
                defaultValue="cash"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="cash">{t("cash")}</option>
                <option value="card">{t("card")}</option>
                <option value="transfer">{t("transfer")}</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
