import { z } from "zod";

export const reopenBusinessDaySchema = z.object({
  reason: z
    .string()
    .min(5, "El motivo debe tener al menos 5 caracteres")
    .max(500, "El motivo no puede superar los 500 caracteres"),
});

export type ReopenBusinessDayInput = z.infer<typeof reopenBusinessDaySchema>;
