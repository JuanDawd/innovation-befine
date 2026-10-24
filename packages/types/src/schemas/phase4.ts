import { z } from "zod";

export const requestEditSchema = z.object({
  ticketItemId: z.uuid("ID de ítem inválido"),
  newServiceVariantId: z.uuid("ID de variante inválido"),
});

export const resolveEditRequestSchema = z.object({
  requestId: z.uuid("ID de solicitud inválido"),
  decision: z.enum(["approved", "rejected"]),
});

export const transitionTicketSchema = z.object({
  ticketId: z.uuid("ID de ticket inválido"),
});

export const voidTicketSchema = z.object({
  ticketId: z.uuid("ID de ticket inválido"),
  reason: z
    .string()
    .trim()
    .min(5, "El motivo debe tener al menos 5 caracteres")
    .max(500, "El motivo no puede superar los 500 caracteres"),
});

export const pieceActionSchema = z.object({
  pieceId: z.uuid("ID de pieza inválido"),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.uuid("Clave de idempotencia inválida").optional(),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.uuid("ID de notificación inválido"),
});

export type RequestEditInput = z.infer<typeof requestEditSchema>;
export type ResolveEditRequestInput = z.infer<typeof resolveEditRequestSchema>;
export type TransitionTicketInput = z.infer<typeof transitionTicketSchema>;
export type VoidTicketInput = z.infer<typeof voidTicketSchema>;
export type PieceActionInput = z.infer<typeof pieceActionSchema>;
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;
