/**
 * Pedido line price rules — T116 (spec §3.1.4, §3.8)
 *
 * - A garment line defaults to the variant's selling_price (never piece_rate).
 * - Only admin and cashier may set another price, and then a reason is required.
 * - A variant without a selling price needs a typed price + reason, so only
 *   admin/cashier can add it; the secretary is told to ask for one.
 * - Editing keeps a line's existing snapshot (price and reason) when neither
 *   its variant nor its price changed, even if the catalog price moved since.
 */

import { priceNeedsReason } from "@befine/db";

export type LinePriceInput = {
  unitPrice: number;
  priceReason?: string;
  sellingPrice: number | null;
  canEditPrices: boolean;
  /** The stored line being edited, when it keeps the same variant */
  existing?: { unitPrice: number; priceReason: string | null };
};

export type LinePriceResult =
  | { ok: true; unitPrice: number; priceReason: string | null }
  | { ok: false; message: string };

export function resolveLinePrice(input: LinePriceInput): LinePriceResult {
  const { unitPrice, sellingPrice, canEditPrices, existing } = input;
  const reason = input.priceReason?.trim() || null;

  if (existing && existing.unitPrice === unitPrice) {
    return { ok: true, unitPrice, priceReason: reason ?? existing.priceReason };
  }

  if (!priceNeedsReason(unitPrice, sellingPrice)) {
    return { ok: true, unitPrice, priceReason: null };
  }

  if (!canEditPrices) {
    return {
      ok: false,
      message:
        sellingPrice === null
          ? "Esta prenda no tiene precio de venta. Pide al administrador que lo configure en el catálogo."
          : "Solo administración o caja pueden cambiar el precio de una prenda.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      message:
        sellingPrice === null
          ? "Esta prenda no tiene precio de venta: escribe el precio y el motivo."
          : "Escribe el motivo del cambio de precio.",
    };
  }

  return { ok: true, unitPrice, priceReason: reason };
}
