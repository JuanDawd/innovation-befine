import { z } from "zod";

export const logAbsenceSchema = z.object({
  employeeId: z.uuid("ID de empleado inválido"),
  type: z.enum(["vacation", "approved_absence", "missed"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  note: z.string().max(500).nullish(),
});

export type LogAbsenceInput = z.infer<typeof logAbsenceSchema>;

export const deleteAbsenceSchema = z.object({
  absenceId: z.uuid("ID de ausencia inválido"),
});

export type DeleteAbsenceInput = z.infer<typeof deleteAbsenceSchema>;
