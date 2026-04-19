import { z } from "zod";

export const createAppointmentSchema = z
  .object({
    clientType: z.enum(["saved", "guest"]),
    clientId: z.string().uuid().optional(),
    guestName: z.string().min(1).max(100).optional(),
    stylistEmployeeId: z.string().uuid("ID de estilista inválido"),
    serviceVariantId: z.string().uuid("ID de variante inválido").optional(),
    serviceSummary: z.string().min(1, "El servicio es obligatorio").max(200),
    scheduledAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480).default(60),
  })
  .refine(
    (d) =>
      (d.clientType === "saved" && d.clientId) || (d.clientType === "guest" && d.guestName?.trim()),
    {
      message: "Se requiere un cliente guardado o nombre de invitado",
      path: ["clientType"],
    },
  );

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
