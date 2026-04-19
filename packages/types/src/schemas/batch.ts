import { z } from "zod";

export const batchPieceLineSchema = z.object({
  clothPieceId: z.uuid("ID de pieza inválido"),
  assignedToEmployeeId: z.uuid("ID de empleado inválido").nullable(),
});

export const createBatchSchema = z.object({
  notes: z.string().max(500).optional(),
  pieces: z.array(batchPieceLineSchema).min(1, "El lote debe tener al menos una pieza"),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type BatchPieceLine = z.infer<typeof batchPieceLineSchema>;
