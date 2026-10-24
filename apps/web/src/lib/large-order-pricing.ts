/**
 * H-58 — what a large-order line charges the client per garment: the
 * variant's selling price. The piece rate is what the clothier is paid and
 * must never price an order. No selling price → 0, so the price is typed in.
 */
export function orderUnitPrice(
  variant: { sellingPrice: number | null; pieceRate: number } | undefined,
): number {
  return variant?.sellingPrice ?? 0;
}
