/**
 * Pedido payment rules — T127 (spec §3.5.19–21)
 *
 * Pure, so they are unit tested and shared by the server action and the
 * payment dialog:
 *   - a payment is at most the balance (no silent overpay); never on a
 *     cancelled or inventory pedido
 *   - a refund is at most what was paid, and needs a note; allowed on a
 *     cancelled pedido or when there is saldo a favor
 *   - after-hours payments carry "Pagado fuera de horario el {fecha} a las {hora}"
 */

export type PaymentCheckInput = {
  kind: "payment" | "refund";
  amount: number;
  destination: "client" | "inventory";
  cancelled: boolean;
  /** Net received so far */
  paid: number;
  /** What the client still owes (≥ 0) */
  balance: number;
  /** What the business owes the client (≥ 0) */
  saldoAFavor: number;
  note?: string | null;
};

const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;

export function checkPedidoPayment(input: PaymentCheckInput): string | null {
  const { kind, amount } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return "El valor debe ser un número entero de pesos mayor que $0.";
  if (input.destination === "inventory") return "Los pedidos para inventario no reciben pagos.";

  if (kind === "payment") {
    if (input.cancelled) return "El pedido está cancelado: no recibe pagos.";
    if (input.balance <= 0) return "Este pedido ya está pagado.";
    if (amount > input.balance)
      return `El saldo es ${pesos(input.balance)}: no se puede cobrar más.`;
    return null;
  }

  if (!input.note?.trim()) return "Escribe el motivo de la devolución.";
  if (input.paid <= 0) return "Este pedido no tiene pagos para devolver.";
  // A refund returns money the business holds for the client: what is owed
  // back (saldo a favor), or everything paid once the pedido is cancelled.
  const refundable = input.cancelled ? input.paid : input.saldoAFavor;
  if (refundable <= 0) return "No hay saldo a favor para devolver.";
  if (amount > refundable) return `Solo se pueden devolver ${pesos(refundable)}.`;
  return null;
}

/** "Pagado fuera de horario el 24 oct a las 9:15 p. m." (Bogotá time). */
export function afterHoursNote(receivedAt: Date): string {
  const date = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: "America/Bogota",
  }).format(receivedAt);
  const time = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(receivedAt);
  return `Pagado fuera de horario el ${date} a las ${time}`;
}
