import { z } from "zod";

export const paymentLineSchema = z.object({
  method: z.enum(["cash", "card", "transfer"]),
  // M-80: negative = refund (devolución) when a reopened ticket ends up cheaper
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "El monto no puede ser cero"),
});

export const checkoutSessionSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1),
  // Empty only when nothing is due (a reopened ticket whose price didn't change)
  payments: z.array(paymentLineSchema),
  idempotencyKey: z.uuid(),
});

export type PaymentLine = z.infer<typeof paymentLineSchema>;
export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;

export const paidOfflineCheckoutSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  amount: z.number().int().positive(),
  idempotencyKey: z.uuid(),
});

export type PaidOfflineCheckoutInput = z.infer<typeof paidOfflineCheckoutSchema>;
