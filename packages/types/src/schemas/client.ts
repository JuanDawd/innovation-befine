import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  phone: z.string().max(20).optional(),
  email: z.email("Email inválido").max(150).optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

export const editClientSchema = createClientSchema;

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type EditClientInput = z.infer<typeof editClientSchema>;
