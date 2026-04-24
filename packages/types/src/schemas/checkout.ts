import { z } from "zod";

export const paymentLineSchema = z.object({
  method: z.enum(["cash", "card", "transfer"]),
  amount: z.number().int().positive(),
});

export const checkoutSessionSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1),
  payments: z.array(paymentLineSchema).min(1),
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
