"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLargeOrder, type ClientOption } from "./actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

type Props = {
  clients: ClientOption[];
  clothPieces: ClothPieceRow[];
  canOverridePrice: boolean;
};

export function CreateLargeOrderForm({ clients, clothPieces, canOverridePrice }: Props) {
  const t = useTranslations("largeOrders");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [withDeposit, setWithDeposit] = useState(false);

  // Product selector state
  const [search, setSearch] = useState("");
  const [selectedPiece, setSelectedPiece] = useState<ClothPieceRow | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [withOverride, setWithOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const filteredPieces = clothPieces.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const computedTotal = unitPrice * quantity;

  function handleSelectPiece(piece: ClothPieceRow) {
    setSelectedPiece(piece);
    setSearch("");
    // Use the first active variant's piece_rate as reference price
    const firstVariant = piece.variants.find((v) => v.isActive);
    if (firstVariant && unitPrice === 0) {
      setUnitPrice(firstVariant.pieceRate);
    }
  }

  function handleClearPiece() {
    setSelectedPiece(null);
    setUnitPrice(0);
    setWithOverride(false);
    setOverrideReason("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validate override reason
    if (withOverride && !overrideReason.trim()) {
      setFieldErrors((prev) => ({ ...prev, overrideReason: t("overrideReasonRequired") }));
      return;
    }

    const fd = new FormData(e.currentTarget);
    const depositAmountRaw = fd.get("initialDepositAmount") as string;
    const depositAmount = depositAmountRaw ? parseInt(depositAmountRaw, 10) : undefined;

    const rawTotalPrice = parseInt(fd.get("totalPrice") as string, 10);

    const input = {
      clientId: fd.get("clientId") as string,
      description: fd.get("description") as string,
      totalPrice: rawTotalPrice,
      estimatedDeliveryAt: (fd.get("estimatedDeliveryAt") as string) || undefined,
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
        }
        return;
      }
      router.push(`/large-orders/${res.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ─── Product selector ─── */}
      {clothPieces.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">{t("productSelector")}</p>

          {selectedPiece ? (
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <span className="text-sm font-medium">{selectedPiece.name}</span>
              <button
                type="button"
                onClick={handleClearPiece}
                className="ml-2 text-muted-foreground hover:text-foreground"
                aria-label={t("clearProduct")}
              >
                <XIcon className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("productSearchPlaceholder")}
                className="w-full h-9 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              />
              {search && filteredPieces.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                  {filteredPieces.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectPiece(p)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                      >
                        {p.name}
                        {p.description && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            {p.description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search && filteredPieces.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground px-1">{t("noProducts")}</p>
              )}
            </div>
          )}

          {/* Quantity + unit price */}
          {selectedPiece && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t("quantity")}</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("unitPrice")}
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseInt(e.target.value, 10) || 0)}
                  disabled={!withOverride && canOverridePrice}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Price override — cashier_admin only */}
          {selectedPiece && canOverridePrice && (
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withOverride}
                  onChange={(e) => setWithOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">{t("manualPrice")}</span>
              </label>
              {withOverride && (
                <div className="space-y-1 pl-6">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("overrideReason")} <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    rows={2}
                    placeholder={t("overrideReasonPlaceholder")}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
                  />
                  {fieldErrors.overrideReason && (
                    <p className="text-xs text-destructive">{fieldErrors.overrideReason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Computed total preview */}
          {selectedPiece && computedTotal > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {quantity} × ${unitPrice.toLocaleString("es-CO")} =
              </span>
              <span className="font-mono font-semibold">
                ${computedTotal.toLocaleString("es-CO")}
              </span>
            </div>
          )}
        </div>
      )}

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

      {/* Description — pre-filled from product selector */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">
          {t("description")} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          maxLength={500}
          rows={3}
          defaultValue={selectedPiece ? selectedPiece.name : ""}
          key={selectedPiece?.id ?? "none"}
          placeholder={t("descriptionPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
        />
        {fieldErrors.description && (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        )}
      </div>

      {/* Total price — pre-filled from computed total */}
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
          key={computedTotal || "manual"}
          defaultValue={computedTotal > 0 ? computedTotal : undefined}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
        />
        {fieldErrors.totalPrice && (
          <p className="text-xs text-destructive">{fieldErrors.totalPrice}</p>
        )}
      </div>

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
        {isPending ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
