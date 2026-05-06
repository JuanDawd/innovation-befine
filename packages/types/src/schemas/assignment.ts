import { z } from "zod";

export const createAssignmentSchema = z.object({
  orderItemId: z.uuid("ID de ítem inválido"),
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

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateCompletedQuantityInput = z.infer<typeof updateCompletedQuantitySchema>;
export type ApproveAssignmentQuantityInput = z.infer<typeof approveAssignmentQuantitySchema>;
