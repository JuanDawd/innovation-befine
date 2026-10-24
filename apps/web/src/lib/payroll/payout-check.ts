/**
 * H-59 — server-side guard for recording a payout. The amount the admin saw
 * was computed in an earlier request; the server recomputes it and refuses
 * when it changed (a ticket reopened, a piece approved) so a stale figure is
 * never paid or audited as "computed". A payout of $0 is refused too: it
 * would mark the days settled with nothing paid (see H-57).
 */

export type PayoutCheckInput = {
  amount: number;
  /** What the admin's preview showed */
  originalComputedAmount: number;
  /** What the server computes now for the same employee and days */
  serverComputedAmount: number;
  adjustmentReason?: string | null;
};

export type PayoutCheckError = { code: "STALE_DATA" | "VALIDATION_ERROR"; message: string };

const cop = (n: number) => `$${n.toLocaleString("es-CO")}`;

export function checkPayout(input: PayoutCheckInput): PayoutCheckError | null {
  if (input.serverComputedAmount !== input.originalComputedAmount)
    return {
      code: "STALE_DATA",
      message: `El cálculo cambió desde que lo abriste: ahora es ${cop(input.serverComputedAmount)}. Revisa el detalle y vuelve a confirmar.`,
    };
  if (input.amount <= 0)
    return {
      code: "VALIDATION_ERROR",
      message: "No hay nada que pagar: el monto es $0. Los días quedan pendientes.",
    };
  if (input.amount !== input.serverComputedAmount && !input.adjustmentReason?.trim())
    return {
      code: "VALIDATION_ERROR",
      message: "Se requiere motivo cuando el monto difiere del calculado",
    };
  return null;
}
