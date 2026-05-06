import { z } from "zod";

export const addOrderItemSchema = z.object({
  largeOrderId: z.uuid("ID de orden inválido"),
  clothPieceId: z.uuid("ID de pieza inválido"),
  clothPieceVariantId: z.uuid("ID de variante inválido"),
  pieceName: z.string().min(1).max(120),
  quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
  notes: z.string().max(500).optional(),
});

export const editOrderItemSchema = z.object({
  itemId: z.uuid("ID de ítem inválido"),
  quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
  notes: z.string().max(500).optional(),
});

export const removeOrderItemSchema = z.object({
  itemId: z.uuid("ID de ítem inválido"),
});

export const createAssignmentSchema = z.object({
  orderItemId: z.uuid("ID de ítem inválido"),
  craftablePieceId: z.uuid("ID de pieza confeccionable inválido"),
  assigneeId: z.uuid("ID de empleado inválido"),
  assignedQuantity: z.number().int().min(1, "La cantidad asignada debe ser al menos 1"),
});

export const updateCompletedQuantitySchema = z.object({
  assignmentId: z.uuid("ID de asignación inválido"),
  completedQuantity: z.number().int().min(0, "La cantidad completada no puede ser negativa"),
  expectedVersion: z.number().int().min(1, "Versión inválida"),
});

export const approveAssignmentQuantitySchema = z.object({
  assignmentId: z.uuid("ID de asignación inválido"),
  approvedQuantity: z.number().int().min(0, "La cantidad aprobada no puede ser negativa"),
  expectedVersion: z.number().int().min(1, "Versión inválida"),
});

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;
export type EditOrderItemInput = z.infer<typeof editOrderItemSchema>;
export type RemoveOrderItemInput = z.infer<typeof removeOrderItemSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateCompletedQuantityInput = z.infer<typeof updateCompletedQuantitySchema>;
export type ApproveAssignmentQuantityInput = z.infer<typeof approveAssignmentQuantitySchema>;
