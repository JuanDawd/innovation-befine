import { z } from "zod";

export const createAppointmentSchema = z
  .object({
    clientType: z.enum(["saved", "guest"]),
    clientId: z.uuid().optional(),
    guestName: z.string().min(1).max(100).optional(),
    stylistEmployeeId: z.uuid("ID de estilista inválido"),
    serviceVariantId: z.uuid("ID de variante inválido").optional(),
    serviceSummary: z.string().min(1, "El servicio es obligatorio").max(200),
    scheduledAt: z.iso.datetime({ offset: true }),
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

export const transitionAppointmentSchema = z
  .object({
    appointmentId: z.uuid("ID de cita inválido"),
    // "reopen" reverses a no_show back to booked (T032b — triggers decrement)
    // "reschedule" moves booked/confirmed to a new date/time with overlap re-check (T053)
    action: z.enum(["confirm", "cancel", "no_show", "complete", "reopen", "reschedule"]),
    cancellationReason: z.string().max(500).optional(),
    newScheduledAt: z.iso.datetime({ offset: true }).optional(),
    // T05R-R7: optionally link a ticket when completing an appointment
    ticketId: z.uuid("ID de ticket inválido").optional(),
  })
  .refine((d) => d.action !== "reschedule" || !!d.newScheduledAt, {
    message: "Se requiere la nueva fecha/hora para reagendar",
    path: ["newScheduledAt"],
  });

export type TransitionAppointmentInput = z.infer<typeof transitionAppointmentSchema>;
