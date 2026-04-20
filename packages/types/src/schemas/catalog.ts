import { z } from "zod";

// ─── Service schemas ───────────────────────────────────────────────────────

export const createServiceVariantSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  customerPrice: z.number().int().min(0, "El precio no puede ser negativo"),
  commissionPct: z
    .number()
    .min(0, "La comisión no puede ser negativa")
    .max(100, "La comisión no puede superar 100%"),
});

export const createServiceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  description: z.string().max(500).optional(),
  variants: z
    .array(createServiceVariantSchema)
    .min(1, "El servicio debe tener al menos una variante"),
});

export const editServiceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  description: z.string().max(500).optional(),
});

export const editServiceVariantSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  customerPrice: z.number().int().min(0, "El precio no puede ser negativo"),
  commissionPct: z
    .number()
    .min(0, "La comisión no puede ser negativa")
    .max(100, "La comisión no puede superar 100%"),
});

export const addVariantSchema = editServiceVariantSchema;

// ─── Cloth piece schemas ───────────────────────────────────────────────────

export const createClothPieceSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100),
  description: z.string().max(500).optional(),
});

export const editClothPieceSchema = createClothPieceSchema;

// ─── Inferred types ────────────────────────────────────────────────────────

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type EditServiceInput = z.infer<typeof editServiceSchema>;
export type EditServiceVariantInput = z.infer<typeof editServiceVariantSchema>;
export type AddVariantInput = z.infer<typeof addVariantSchema>;
export type CreateClothPieceInput = z.infer<typeof createClothPieceSchema>;
export type EditClothPieceInput = z.infer<typeof editClothPieceSchema>;
