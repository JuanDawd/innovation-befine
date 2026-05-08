"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createClothSale,
  listSellableClothPieces,
  listClientsForSale,
  type SellableClothPiece,
  type ClientOption,
} from "@/app/(protected)/cashier/actions/cloth-sales";
import { Button } from "@/components/ui/button";

interface SellClothPieceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — pre-links the sale to an open ticket */
  ticketId?: string;
}

export function SellClothPieceModal({ open, onOpenChange, ticketId }: SellClothPieceModalProps) {
  const [isPending, startTransition] = useTransition();
  const [isLoading, startLoadTransition] = useTransition();
  const fetchedRef = useRef(false);

  const [pieces, setPieces] = useState<SellableClothPiece[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [priceOverride, setPriceOverride] = useState("");
  const [customerType, setCustomerType] = useState<"none" | "client" | "guest">("none");
  const [clientId, setClientId] = useState("");
  const [guestName, setGuestName] = useState("");

  // Fetch data once when the modal opens for the first time
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    startLoadTransition(async () => {
      const [piecesRes, clientsRes] = await Promise.all([
        listSellableClothPieces(),
        listClientsForSale(),
      ]);
      if (piecesRes.success) setPieces(piecesRes.data);
      if (clientsRes.success) setClients(clientsRes.data);
    });
  }, [open]);

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
      toast.success(`Venta registrada — $${res.data.effectiveTotal.toLocaleString("es-CO")}`);
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vender prenda</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin mr-2" />
            Cargando…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Piece selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="sell-piece">
                Prenda <span className="text-destructive">*</span>
              </label>
              <select
                id="sell-piece"
                value={selectedPieceId}
                onChange={(e) => handlePieceChange(e.target.value)}
                required
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="">Seleccionar prenda…</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Variant selector */}
            {selectedPiece && (
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sell-variant">
                  Variante <span className="text-destructive">*</span>
                </label>
                <select
                  id="sell-variant"
                  value={selectedVariantId}
                  onChange={(e) => handleVariantChange(e.target.value)}
                  required
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                >
                  <option value="">Seleccionar variante…</option>
                  {selectedPiece.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.sellingPrice != null
                        ? ` — $${v.sellingPrice.toLocaleString("es-CO")}`
                        : " — sin precio"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity + price row */}
            {selectedVariantId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sell-qty">
                    Cantidad
                  </label>
                  <input
                    id="sell-qty"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sell-price">
                    Precio unit.{" "}
                    {basePrice != null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        (base ${basePrice.toLocaleString("es-CO")})
                      </span>
                    )}
                  </label>
                  <input
                    id="sell-price"
                    type="number"
                    min={0}
                    placeholder={basePrice != null ? basePrice.toString() : "Requerido"}
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    required={basePrice === null}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
              </div>
            )}

            {/* Total preview */}
            {total != null && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-mono font-semibold">${total.toLocaleString("es-CO")}</span>
              </div>
            )}

            {/* Customer (optional) */}
            {selectedVariantId && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Cliente{" "}
                  <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["none", "client", "guest"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCustomerType(type)}
                      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                        customerType === type
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {type === "none"
                        ? "Anónimo"
                        : type === "client"
                          ? "Cliente registrado"
                          : "Invitado"}
                    </button>
                  ))}
                </div>

                {customerType === "client" && (
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                    aria-label="Cliente registrado"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                  >
                    <option value="">Seleccionar cliente…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {customerType === "guest" && (
                  <input
                    type="text"
                    placeholder="Nombre del cliente"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    aria-label="Nombre del cliente"
                    maxLength={120}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                  />
                )}
              </div>
            )}

            {ticketId && (
              <p className="text-xs text-muted-foreground">
                Esta venta quedará vinculada al ticket actual.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={isPending || !selectedVariantId || effectiveUnitPrice == null}
                className="flex-1"
              >
                {isPending ? <Loader2Icon className="size-4 animate-spin mr-2" /> : null}
                Registrar venta
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
