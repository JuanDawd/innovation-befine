/**
 * Stock rules — T128 (spec §3.6.23–24)
 *
 * Stock never goes below 0 except through an explicit admin override, which
 * is logged. Pure so the server action and the adjustment dialog agree.
 */

export function checkStockChange(input: {
  quantity: number;
  onHand: number;
  allowNegative?: boolean;
}): string | null {
  if (!Number.isInteger(input.quantity) || input.quantity === 0)
    return "La cantidad debe ser un número entero distinto de 0.";
  const after = input.onHand + input.quantity;
  if (after < 0 && !input.allowNegative)
    return input.onHand > 0
      ? `Solo hay ${input.onHand} en inventario: no se pueden sacar ${-input.quantity}.`
      : "No hay unidades en inventario para sacar.";
  return null;
}

/**
 * Vender prenda — T129 (spec §3.6.24). A sale never takes more than is on
 * hand; only the admin may oversell, with a reason, and it is recorded.
 */
export function checkSaleStock(input: {
  quantity: number;
  onHand: number;
  isAdmin: boolean;
  oversell?: boolean;
  oversellReason?: string | null;
}): string | null {
  if (input.quantity <= input.onHand) return null;
  if (input.oversell) {
    if (!input.isAdmin) return "Solo un administrador puede vender sin existencias.";
    if (!input.oversellReason?.trim()) return "Escribe el motivo para vender sin existencias.";
    return null;
  }
  return input.onHand > 0
    ? `Solo ${input.onHand === 1 ? "queda 1 disponible" : `quedan ${input.onHand} disponibles`}. Alguien pudo vender mientras tanto.`
    : "No hay existencias de esta prenda en esa talla y color.";
}

/** One advisory lock per variant + size + colour: stock checks can't race. */
export function stockLockKey(item: {
  clothPieceVariantId: string;
  sizeId: string | null;
  colorId: string | null;
  detailsKey?: string;
}): string {
  return `stock:${item.clothPieceVariantId}:${item.sizeId ?? "-"}:${item.colorId ?? "-"}${item.detailsKey ? `:${item.detailsKey}` : ""}`;
}
