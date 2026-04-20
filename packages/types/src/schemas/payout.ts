import { z } from "zod";

export const recordPayoutSchema = z.object({
  idempotencyKey: z.uuid("Clave de idempotencia inválida"),
  employeeId: z.uuid("ID de empleado inválido"),
  businessDayIds: z.array(z.uuid()).min(1, "Selecciona al menos un día laboral"),
  amount: z.number().int().nonnegative("El monto no puede ser negativo"),
  originalComputedAmount: z.number().int().nonnegative(),
  adjustmentReason: z.string().max(500).nullish(),
  method: z.enum(["cash", "card", "transfer"]),
  notes: z.string().max(500).nullish(),
});

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;

export const terminateEmployeeSchema = z.object({
  employeeId: z.uuid("ID de empleado inválido"),
  terminationAmount: z.number().int().nonnegative("El monto de liquidación no puede ser negativo"),
  method: z.enum(["cash", "card", "transfer"]),
  reason: z.string().min(1, "Se requiere motivo de liquidación").max(500),
});

export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;
