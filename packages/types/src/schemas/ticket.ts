import { z } from "zod";

export const createTicketSchema = z
  .object({
    employeeId: z.uuid("ID de empleado inválido"),
    serviceVariantId: z.uuid("ID de servicio inválido"),
    quantity: z.number().int().min(1).default(1),
    clientType: z.enum(["saved", "guest"]),
    clientId: z.uuid().optional(),
    guestName: z.string().min(1).max(100).optional(),
    idempotencyKey: z.uuid("Clave de idempotencia inválida"),
  })
  .refine(
    (d) =>
      (d.clientType === "saved" && d.clientId) || (d.clientType === "guest" && d.guestName?.trim()),
    {
      message: "Se requiere un cliente guardado o nombre de invitado",
      path: ["clientType"],
    },
  );

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
