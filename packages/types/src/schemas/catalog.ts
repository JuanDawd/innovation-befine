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

/** L-03 — one page of an entity's audit log; `beforeId` is the oldest entry already shown. */
export const auditLogPageSchema = z.object({
  entityId: z.uuid("ID inválido"),
  beforeId: z.uuid("ID inválido").optional(),
});
export type AuditLogPageInput = z.infer<typeof auditLogPageSchema>;

// ─── Product details (T137) ─────────────────────────────────────────────────

export const detailSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  splitsStock: z.boolean(),
  allowFreeText: z.boolean(),
});

export const detailValueSchema = z.object({
  label: z.string().trim().min(1, "El valor es obligatorio").max(40, "Máximo 40 caracteres"),
});

export const productDetailsSchema = z.object({
  details: z
    .array(
      z.object({
        detailId: z.uuid(),
        required: z.boolean(),
        allValues: z.boolean(),
        valueIds: z.array(z.uuid()).max(500),
      }),
    )
    .max(50)
    .refine((list) => list.every((d) => d.allValues || d.valueIds.length > 0), {
      message: "Elige al menos un valor para cada detalle, o déjalo con todos",
    }),
});

// ─── Garment sizes and colours (T110) ──────────────────────────────────────

export const garmentSizeSchema = z.object({
  label: z.string().trim().min(1, "La talla es obligatoria").max(20, "Máximo 20 caracteres"),
});

export const garmentColorSchema = z.object({
  label: z.string().trim().min(1, "El color es obligatorio").max(40, "Máximo 40 caracteres"),
  hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Usa el formato #RRGGBB")
    .nullable()
    .optional(),
});

/** Full new order of the size list — every size id, first to last. */
export const reorderGarmentSizesSchema = z.object({
  ids: z.array(z.uuid("ID inválido")).min(1).max(200),
});

export type GarmentSizeInput = z.infer<typeof garmentSizeSchema>;
export type GarmentColorInput = z.infer<typeof garmentColorSchema>;
export type ReorderGarmentSizesInput = z.infer<typeof reorderGarmentSizesSchema>;
