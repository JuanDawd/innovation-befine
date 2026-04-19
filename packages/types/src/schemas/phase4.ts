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

export const pieceActionSchema = z.object({
  pieceId: z.uuid("ID de pieza inválido"),
  expectedVersion: z.number().int().nonnegative(),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.uuid("ID de notificación inválido"),
});

export type RequestEditInput = z.infer<typeof requestEditSchema>;
export type ResolveEditRequestInput = z.infer<typeof resolveEditRequestSchema>;
export type TransitionTicketInput = z.infer<typeof transitionTicketSchema>;
export type PieceActionInput = z.infer<typeof pieceActionSchema>;
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;
