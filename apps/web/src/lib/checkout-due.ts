/**
 * M-80 — what a checkout must collect. A reopened ticket was already paid
 * (`prepaid`); only the difference with its current total is charged, or
 * refunded when it became cheaper. Payments must all go the same way as the
 * amount due and add up to it exactly; nothing due → no payment lines.
 */

export type DueTicket = { total: number; prepaid: number };
export type DuePayment = { amount: number };

export function amountDue(tickets: DueTicket[]): number {
  return tickets.reduce((sum, t) => sum + t.total - t.prepaid, 0);
}

export function paymentsMatchDue(due: number, payments: DuePayment[]): boolean {
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  if (sum !== due) return false;
  if (due === 0) return payments.length === 0;
  return payments.every((p) => (due > 0 ? p.amount > 0 : p.amount < 0));
}
