import { z } from "zod";

const APP_ROLES = ["cashier_admin", "secretary", "stylist", "clothier"] as const;
const STYLIST_SUBTYPES = [
  "hairdresser",
  "manicurist",
  "masseuse",
  "makeup_artist",
  "spa_manager",
] as const;

/**
 * Used with React Hook Form (valueAsNumber on number inputs) and server actions.
 * Number fields must use `register("field", { valueAsNumber: true })` in the form.
 */
export const createEmployeeSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
    email: z.email("Ingresa un correo electrónico válido"),
    role: z.enum(APP_ROLES, { message: "Selecciona un rol válido" }),
    stylistSubtype: z.enum(STYLIST_SUBTYPES).nullable().optional(),
    dailyRate: z
      .number()
      .int("La tarifa debe ser un número entero")
      .min(0, "La tarifa no puede ser negativa")
      .nullable()
      .optional(),
    expectedWorkDays: z.number().int().min(1, "Mínimo 1 día").max(7, "Máximo 7 días"),
    temporaryPassword: z
      .string()
      .min(8, "La contraseña temporal debe tener al menos 8 caracteres")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.role === "stylist" && !data.stylistSubtype) return false;
      return true;
    },
    { message: "Los estilistas deben tener un subtipo", path: ["stylistSubtype"] },
  )
  .refine(
    (data) => {
      if (data.role === "secretary" && (data.dailyRate === null || data.dailyRate === undefined))
        return false;
      return true;
    },
    { message: "Las secretarias deben tener una tarifa diaria", path: ["dailyRate"] },
  );

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
