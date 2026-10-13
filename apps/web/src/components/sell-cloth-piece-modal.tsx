"use client";

import { notifyDataChanged } from "@/lib/data-events";
import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createClothSale,
  type SellableClothPiece,
  type ClientOption,
} from "@/app/(protected)/cashier/actions/cloth-sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/i18n";
import { fetchQuery } from "@/lib/action-query";

interface SellClothPieceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — pre-links the sale to an open ticket */
  ticketId?: string;
}

export function SellClothPieceModal({ open, onOpenChange, ticketId }: SellClothPieceModalProps) {
  const t = useTranslations("clothSale");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  // Loaded when the modal first opens, then cached (reopening is instant).
  const piecesQuery = useQuery({
    queryKey: queryKeys.catalog.sellableClothPieces,
    queryFn: () => fetchQuery("sellableClothPieces"),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.options,
    queryFn: () => fetchQuery("clientsForSale"),
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const pieces: SellableClothPiece[] = piecesQuery.data ?? [];
  const clients: ClientOption[] = clientsQuery.data ?? [];
  const isLoading = piecesQuery.isPending || clientsQuery.isPending;

  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priceOverride, setPriceOverride] = useState("");
  const [customerType, setCustomerType] = useState<"none" | "client" | "guest">("none");
  const [clientId, setClientId] = useState("");
  const [guestName, setGuestName] = useState("");

  const selectedPiece = pieces.find((p) => p.id === selectedPieceId);
  const selectedVariant = selectedPiece?.variants.find((v) => v.id === selectedVariantId);
  const basePrice = selectedVariant?.sellingPrice ?? null;
  const effectiveUnitPrice = priceOverride !== "" ? parseInt(priceOverride, 10) : basePrice;
  const total =
    effectiveUnitPrice != null && !isNaN(effectiveUnitPrice) ? effectiveUnitPrice * quantity : null;

  function reset() {
    setSelectedPieceId("");
    setSelectedVariantId("");
    setQuantity(1);
    setPriceOverride("");
    setCustomerType("none");
    setClientId("");
    setGuestName("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handlePieceChange(pieceId: string) {
    setSelectedPieceId(pieceId);
    setSelectedVariantId("");
    setPriceOverride("");
  }

  function handleVariantChange(variantId: string) {
    setSelectedVariantId(variantId);
    setPriceOverride("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariantId) return;

    startTransition(async () => {
      const res = await createClothSale({
        clothPieceVariantId: selectedVariantId,
        quantity,
        priceOverride: priceOverride !== "" ? parseInt(priceOverride, 10) : null,
        clientId: customerType === "client" && clientId ? clientId : null,
        guestName: customerType === "guest" && guestName.trim() ? guestName.trim() : null,
        ticketId: ticketId ?? null,
      });

      if (!res.success) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t("success", { total: formatMoney(res.data.effectiveTotal) }));
      notifyDataChanged("clothSales", "tickets", "businessDay");
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin mr-2" aria-hidden="true" />
            {tc("loading")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Piece selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="sell-piece">
                {t("piece")} <span className="text-destructive">*</span>
              </label>
              <NativeSelect
                id="sell-piece"
                value={selectedPieceId}
                onChange={(e) => handlePieceChange(e.target.value)}
                required
                className="w-full"
                selectClassName="h-9 text-sm"
              >
                <option value="">{t("piecePlaceholder")}</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Variant selector */}
            {selectedPiece && (
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sell-variant">
                  {t("variant")} <span className="text-destructive">*</span>
                </label>
                <NativeSelect
                  id="sell-variant"
                  value={selectedVariantId}
                  onChange={(e) => handleVariantChange(e.target.value)}
                  required
                  className="w-full"
                  selectClassName="h-9 text-sm"
                >
                  <option value="">{t("variantPlaceholder")}</option>
                  {selectedPiece.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.sellingPrice != null
                        ? ` — ${formatMoney(v.sellingPrice)}`
                        : ` — ${t("noPrice")}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {/* Quantity + price row */}
            {selectedVariantId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sell-qty">
                    {t("quantity")}
                  </label>
                  <Input
                    id="sell-qty"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-9 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sell-price">
                    {t("unitPrice")}{" "}
                    {basePrice != null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("basePrice", { price: formatMoney(basePrice) })}
                      </span>
                    )}
                  </label>
                  <Input
                    id="sell-price"
                    type="number"
                    min={0}
                    placeholder={basePrice != null ? basePrice.toString() : t("priceRequired")}
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    required={basePrice === null}
                    className="h-9 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Total preview */}
            {total != null && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("total")}</span>
                <span className="font-mono font-semibold">{formatMoney(total)}</span>
              </div>
            )}

            {/* Customer (optional) */}
            {selectedVariantId && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("customer")}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {tc("optional")}
                  </span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["none", "client", "guest"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCustomerType(type)}
                      aria-pressed={customerType === type}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                        customerType === type
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {t(`customerType.${type}`)}
                    </button>
                  ))}
                </div>

                {customerType === "client" && (
                  <NativeSelect
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                    aria-label={t("customerType.client")}
                    className="w-full"
                    selectClassName="h-9 text-sm"
                  >
                    <option value="">{t("clientPlaceholder")}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}

                {customerType === "guest" && (
                  <Input
                    type="text"
                    placeholder={t("guestName")}
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    aria-label={t("guestName")}
                    maxLength={120}
                    className="h-9"
                  />
                )}
              </div>
            )}

            {ticketId && <p className="text-xs text-muted-foreground">{t("linkedToTicket")}</p>}

            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={isPending || !selectedVariantId || effectiveUnitPrice == null}
                className="flex-1"
              >
                {isPending ? (
                  <Loader2Icon className="size-4 animate-spin mr-2" aria-hidden="true" />
                ) : null}
                {t("submit")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {tc("cancel")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
