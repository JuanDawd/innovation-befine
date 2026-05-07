import { z } from "zod";

export const productPieceLineSchema = z.object({
  clothPieceId: z.uuid("ID de pieza inválido"),
  clothPieceVariantId: z.uuid("ID de variante inválido"),
  assignedToEmployeeId: z.uuid("ID de empleado inválido").nullable(),
  quantity: z.number().int().min(1, "La cantidad mínima es 1").max(999).default(1),
  color: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  instructions: z.string().max(500).optional(),
});

export const createProductSchema = z.object({
  notes: z.string().max(500).optional(),
  largeOrderId: z.uuid("ID de pedido inválido").optional(),
  pieces: z.array(productPieceLineSchema).min(1, "El producto debe tener al menos una pieza"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductPieceLine = z.infer<typeof productPieceLineSchema>;

export const updateProductPieceSchema = z.object({
  id: z.uuid("ID de pieza inválido"),
  version: z.number().int().min(1),
  quantity: z.number().int().min(1, "La cantidad mínima es 1").max(999),
  color: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  instructions: z.string().max(500).optional(),
});

export type UpdateProductPieceInput = z.infer<typeof updateProductPieceSchema>;
