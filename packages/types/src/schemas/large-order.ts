import { z } from "zod";

const largeOrderPieceLineSchema = z.object({
  clothPieceId: z.uuid("ID de pieza inválido"),
  clothPieceVariantId: z.uuid("ID de variante inválido"),
  quantity: z.number().int().min(1).default(1),
  assignedToEmployeeId: z.uuid("ID de empleado inválido").nullable().optional(),
  color: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  instructions: z.string().max(500).optional(),
});

export type LargeOrderPieceLine = z.infer<typeof largeOrderPieceLineSchema>;

export const createLargeOrderSchema = z
  .object({
    clientId: z.uuid("ID de cliente inválido"),
    description: z.string().min(1, "La descripción es obligatoria").max(500),
    totalPrice: z.number().int().min(1, "El precio total debe ser mayor a cero"),
    estimatedDeliveryAt: z.iso.datetime({ offset: true }).nullish(),
    notes: z.string().max(1000).nullish(),
    // Optional initial deposit (creates first large_order_payments record)
    initialDepositAmount: z.number().int().min(0).optional(),
    initialDepositMethod: z.enum(["cash", "card", "transfer"]).optional(),
    // Optional pieces — auto-creates a craftable linked to this order
    pieces: z.array(largeOrderPieceLineSchema).optional(),
  })
  .refine(
    (d) => {
      const hasAmount = d.initialDepositAmount != null && d.initialDepositAmount > 0;
      const hasMethod = d.initialDepositMethod != null;
      return hasAmount === hasMethod;
    },
    {
      message: "Se requiere método de pago cuando se ingresa un depósito",
      path: ["initialDepositMethod"],
    },
  );

export type CreateLargeOrderInput = z.infer<typeof createLargeOrderSchema>;

export const editLargeOrderSchema = z.object({
  description: z.string().min(1, "La descripción es obligatoria").max(500),
  totalPrice: z.number().int().min(1, "El precio total debe ser mayor a cero"),
  estimatedDeliveryAt: z.iso.datetime({ offset: true }).nullish(),
  notes: z.string().max(1000).nullish(),
  version: z.number().int(),
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
  /** Required when action === "cancel" and the order has recorded payments */
  acknowledgedDeposits: z.boolean().optional(),
  version: z.number().int(),
});

export type TransitionLargeOrderInput = z.infer<typeof transitionLargeOrderSchema>;
