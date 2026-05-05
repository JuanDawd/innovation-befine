import { z } from "zod";

export const craftablePieceLineSchema = z.object({
  clothPieceId: z.uuid("ID de pieza inválido"),
  clothPieceVariantId: z.uuid("ID de variante inválido"),
  assignedToEmployeeId: z.uuid("ID de empleado inválido").nullable(),
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

// Back-compat aliases — remove after Task 3.9 (UI rename)
export const createBatchSchema = createCraftableSchema;
export const batchPieceLineSchema = craftablePieceLineSchema;
export type CreateBatchInput = CreateCraftableInput;
export type BatchPieceLine = CraftablePieceLine;
