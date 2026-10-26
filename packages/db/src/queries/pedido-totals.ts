/**
 * Pedido money math — T111 (spec §3.1.4)
 *
 * Total = Σ garment cells × unit_price + Σ adjustment amounts, in whole COP.
 * Pure functions: the same code prices the create form, the detail page and
 * the server-side recomputation (never trust a client-submitted total).
 */

export type PedidoTotalLine =
  | { kind: "garment"; unitPrice: number; cells: { quantity: number }[] }
  | { kind: "adjustment"; amount: number };

function assertPesos(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be whole pesos: ${value}`);
}

/** Units on a garment line (sum of its size cells). */
export function lineUnits(cells: { quantity: number }[]): number {
  let units = 0;
  for (const c of cells) {
    if (!Number.isSafeInteger(c.quantity) || c.quantity < 1)
      throw new RangeError(`quantity must be a whole number ≥ 1: ${c.quantity}`);
    units += c.quantity;
  }
  return units;
}

/** Money for one line: units × unit price, or the adjustment's signed amount. */
export function lineTotal(line: PedidoTotalLine): number {
  if (line.kind === "adjustment") {
    assertPesos(line.amount, "amount");
    return line.amount;
  }
  assertPesos(line.unitPrice, "unitPrice");
  if (line.unitPrice < 0) throw new RangeError(`unitPrice must be ≥ 0: ${line.unitPrice}`);
  const total = lineUnits(line.cells) * line.unitPrice;
  assertPesos(total, "line total");
  return total;
}

export function computePedidoTotal(lines: PedidoTotalLine[]): number {
  let total = 0;
  for (const line of lines) total += lineTotal(line);
  assertPesos(total, "pedido total");
  return total;
}

/**
 * A reason is required when the line price is not the catalog selling price —
 * including when the variant has no selling price at all.
 */
export function priceNeedsReason(unitPrice: number, sellingPrice: number | null): boolean {
  return sellingPrice === null || unitPrice !== sellingPrice;
}

/** #0412 — at least four digits, grows past 9999. */
export function formatPedidoNumber(number: number): string {
  return `#${String(number).padStart(4, "0")}`;
}
