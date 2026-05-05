import { z } from "zod";

export const craftablePieceLineSchema = z.object({
  clothPieceId: z.uuid("ID de pieza inválido"),
  clothPieceVariantId: z.uuid("ID de variante inválido"),
  assignedToEmployeeId: z.uuid("ID de empleado inválido").nullable(),
  quantity: z.number().int().min(1, "La cantidad mínima es 1").max(999).default(1),
  color: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  instructions: z.string().max(500).optional(),
});

export const createCraftableSchema = z.object({
  notes: z.string().max(500).optional(),
  largeOrderId: z.uuid("ID de pedido inválido").optional(),
  pieces: z
    .array(craftablePieceLineSchema)
    .min(1, "El confeccionable debe tener al menos una pieza"),
});

export type CreateCraftableInput = z.infer<typeof createCraftableSchema>;
export type CraftablePieceLine = z.infer<typeof craftablePieceLineSchema>;

export const updateCraftablePieceSchema = z.object({
  id: z.uuid("ID de pieza inválido"),
  version: z.number().int().min(1),
  quantity: z.number().int().min(1, "La cantidad mínima es 1").max(999),
  color: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  instructions: z.string().max(500).optional(),
});

export type UpdateCraftablePieceInput = z.infer<typeof updateCraftablePieceSchema>;
