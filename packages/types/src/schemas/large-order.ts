import { z } from "zod";

export const createLargeOrderSchema = z.object({
  clientId: z.uuid("ID de cliente inválido"),
  description: z.string().min(1, "La descripción es obligatoria").max(500),
  totalPrice: z.number().int().min(1, "El precio total debe ser mayor a cero"),
  estimatedDeliveryAt: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().max(1000).optional(),
  // Optional initial deposit (creates first large_order_payments record)
  initialDepositAmount: z.number().int().min(0).optional(),
  initialDepositMethod: z.enum(["cash", "card", "transfer"]).optional(),
});

export type CreateLargeOrderInput = z.infer<typeof createLargeOrderSchema>;

export const editLargeOrderSchema = z.object({
  description: z.string().min(1, "La descripción es obligatoria").max(500),
  totalPrice: z.number().int().min(1, "El precio total debe ser mayor a cero"),
  estimatedDeliveryAt: z.iso.datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export type EditLargeOrderInput = z.infer<typeof editLargeOrderSchema>;

export const recordLargeOrderPaymentSchema = z.object({
  orderId: z.uuid("ID de pedido inválido"),
  amount: z.number().int().min(1, "El monto debe ser mayor a cero"),
  method: z.enum(["cash", "card", "transfer"]),
  paidAt: z.iso.datetime({ offset: true }).optional(),
});

export type RecordLargeOrderPaymentInput = z.infer<typeof recordLargeOrderPaymentSchema>;

export const transitionLargeOrderSchema = z.object({
  orderId: z.uuid("ID de pedido inválido"),
  action: z.enum(["start_production", "mark_ready", "mark_delivered", "mark_paid", "cancel"]),
  cancellationReason: z.string().min(1).max(500).optional(),
  version: z.number().int(),
});

export type TransitionLargeOrderInput = z.infer<typeof transitionLargeOrderSchema>;
