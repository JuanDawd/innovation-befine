/**
 * Pedido balance — T113 (spec §3.5.21)
 *
 * Balance = total − Σ payments (refunds are negative payments). Never stored.
 * When payments exceed the total (a price cut or restructure after paying),
 * the difference is saldo a favor owed to the client — never a silent
 * negative balance (spec §3.4.16).
 */

export type PedidoBalance = {
  total: number;
  /** Net received: payments minus refunds */
  paid: number;
  /** What the client still owes (≥ 0) */
  balance: number;
  /** What the business owes the client (≥ 0) */
  saldoAFavor: number;
};

export function computePedidoBalance(total: number, payments: { amount: number }[]): PedidoBalance {
  if (!Number.isSafeInteger(total)) throw new RangeError(`total must be whole pesos: ${total}`);
  let paid = 0;
  for (const p of payments) {
    if (!Number.isSafeInteger(p.amount))
      throw new RangeError(`payment must be whole pesos: ${p.amount}`);
    paid += p.amount;
  }
  const due = total - paid;
  return { total, paid, balance: Math.max(due, 0), saldoAFavor: Math.max(-due, 0) };
}
