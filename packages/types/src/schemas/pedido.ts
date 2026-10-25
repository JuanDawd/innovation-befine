import { z } from "zod";

// ─── Pedido create / edit (T116, spec §3.1) ────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** One size of a garment line: a size from the list or a free-text "otra". */
export const pedidoCellSchema = z
  .object({
    sizeId: z.uuid("Talla inválida").optional(),
    sizeOther: optionalText(20),
    quantity: z
      .number("Escribe una cantidad")
      .int("La cantidad debe ser un número entero")
      .min(1, "Mínimo 1 unidad")
      .max(10_000, "Máximo 10.000 unidades"),
  })
  .refine((c) => Boolean(c.sizeId) !== Boolean(c.sizeOther), {
    message: "Elige una talla de la lista o escribe otra",
    path: ["sizeId"],
  });

export const pedidoGarmentLineSchema = z
  .object({
    kind: z.literal("garment"),
    /** Existing line id when editing — keeps its price snapshot */
    id: z.uuid().optional(),
    clothPieceVariantId: z.uuid("Elige la prenda"),
    colorId: z.uuid("Color inválido").optional(),
    colorOther: optionalText(40),
    style: optionalText(200),
    instructions: optionalText(1000),
    unitPrice: z
      .number("Escribe el precio")
      .int("El precio debe ser en pesos enteros")
      .min(0, "El precio no puede ser negativo")
      .max(100_000_000, "Precio demasiado alto"),
    priceReason: optionalText(300),
    /** Why the specs changed on a line already in production (T119) */
    changeReason: optionalText(300),
    cells: z.array(pedidoCellSchema).min(1, "Agrega al menos una talla").max(60),
  })
  .refine((l) => !(l.colorId && l.colorOther), {
    message: "Elige un color de la lista o escribe otro, no ambos",
    path: ["colorId"],
  })
  .refine(
    (l) => {
      const keys = l.cells.map((c) => c.sizeId ?? `other:${c.sizeOther!.toLowerCase()}`);
      return new Set(keys).size === keys.length;
    },
    { message: "Una talla está repetida en la línea", path: ["cells"] },
  );

export const pedidoAdjustmentLineSchema = z.object({
  kind: z.literal("adjustment"),
  id: z.uuid().optional(),
  amount: z
    .number("Escribe el valor")
    .int("El valor debe ser en pesos enteros")
    .refine((v) => v !== 0, "El ajuste no puede ser $0")
    .refine((v) => Math.abs(v) <= 100_000_000, "Valor demasiado alto"),
  priceReason: z.string().trim().min(1, "Escribe el motivo del ajuste").max(300),
});

export const pedidoLineSchema = z.discriminatedUnion("kind", [
  pedidoGarmentLineSchema,
  pedidoAdjustmentLineSchema,
]);

const pedidoBaseSchema = z.object({
  destination: z.enum(["client", "inventory"]),
  clientId: z.uuid("Elige un cliente").optional(),
  /** Phone to save on the client when it has none (client pedidos need one) */
  clientPhone: optionalText(20),
  /** YYYY-MM-DD in America/Bogota */
  estimatedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: optionalText(1000),
  lines: z.array(pedidoLineSchema).min(1, "Agrega al menos una prenda").max(50, "Máximo 50 líneas"),
});

function refineDestination<T extends z.infer<typeof pedidoBaseSchema>>(p: T, ctx: z.RefinementCtx) {
  if (p.destination === "client" && !p.clientId)
    ctx.addIssue({ code: "custom", message: "Elige un cliente", path: ["clientId"] });
  if (p.destination === "inventory" && p.clientId)
    ctx.addIssue({
      code: "custom",
      message: "Un pedido para inventario no lleva cliente",
      path: ["clientId"],
    });
  if (!p.lines.some((l) => l.kind === "garment"))
    ctx.addIssue({ code: "custom", message: "Agrega al menos una prenda", path: ["lines"] });
}

export const createPedidoSchema = pedidoBaseSchema.superRefine(refineDestination);

export const editPedidoSchema = pedidoBaseSchema
  .extend({ version: z.number().int().min(1) })
  .superRefine(refineDestination);

/** Inline client creation from the pedido form: phone is required here. */
export const pedidoClientSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  phone: z
    .string()
    .trim()
    .min(7, "Escribe un teléfono válido")
    .max(20, "Máximo 20 caracteres")
    .regex(/^[+\d][\d\s-]*$/, "Solo números, espacios, guiones o +"),
});

/** Cancel a pedido (spec §3.4.18) */
export const cancelPedidoSchema = z.object({
  version: z.number().int().min(1),
  reason: z.string().trim().min(3, "Escribe el motivo de la cancelación").max(300),
  /** Payments were recorded: the person confirms they will handle the refund */
  acknowledgePayments: z.boolean().optional(),
});

/** Register a delivery (T121): units per cell, only from approved undelivered units. */
export const recordDeliverySchema = z.object({
  idempotencyKey: z.uuid(),
  /** Bogotá date it was handed over; defaults to now */
  deliveredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
  note: optionalText(300),
  cells: z
    .array(
      z.object({
        cellId: z.uuid(),
        quantity: z.number().int("Cantidad inválida").min(0).max(10_000),
      }),
    )
    .max(500)
    .refine((cells) => cells.some((c) => c.quantity > 0), "Indica al menos una unidad entregada")
    .refine((cells) => new Set(cells.map((c) => c.cellId)).size === cells.length, "Talla repetida"),
});

// ─── Assigning work (T122) ─────────────────────────────────────────────────

export const assignUnitsSchema = z.object({
  cellId: z.uuid("Talla inválida"),
  employeeId: z.uuid("Elige una confeccionista"),
  quantity: z
    .number("Escribe la cantidad")
    .int("La cantidad debe ser un número entero")
    .min(1, "Mínimo 1 unidad")
    .max(10_000),
  /** Unassigned units the person saw; a mismatch means someone else assigned meanwhile */
  expectedUnassigned: z.number().int().min(0),
  /** Admin only: a different rate for this assignment, with a reason */
  pieceRate: z.number().int().min(0).max(10_000_000).optional(),
  rateReason: optionalText(300),
});

export const changeAssignmentRateSchema = z.object({
  version: z.number().int().min(1),
  pieceRate: z.number("Escribe la tarifa").int().min(0).max(10_000_000),
  reason: z.string().trim().min(3, "Escribe el motivo").max(300),
});

export const releaseAssignmentSchema = z.object({
  version: z.number().int().min(1),
  quantity: z.number().int().min(1, "Mínimo 1 unidad").max(10_000),
});

// ─── Mi trabajo (T123) ─────────────────────────────────────────────────────

export const claimUnitsSchema = z.object({
  cellId: z.uuid(),
  quantity: z.number("Escribe cuántas").int().min(1, "Mínimo 1 unidad").max(10_000),
  expectedUnassigned: z.number().int().min(0),
});

export const reportUnitsSchema = z.object({
  assignmentId: z.uuid(),
  quantity: z.number("Escribe cuántas").int().min(1, "Mínimo 1 unidad").max(10_000),
  idempotencyKey: z.uuid(),
});

export type ClaimUnitsInput = z.infer<typeof claimUnitsSchema>;
export type ReportUnitsInput = z.infer<typeof reportUnitsSchema>;
export type AssignUnitsInput = z.infer<typeof assignUnitsSchema>;
export type ChangeAssignmentRateInput = z.infer<typeof changeAssignmentRateSchema>;
export type ReleaseAssignmentInput = z.infer<typeof releaseAssignmentSchema>;
export type RecordDeliveryInput = z.infer<typeof recordDeliverySchema>;
export type CancelPedidoInput = z.infer<typeof cancelPedidoSchema>;
export type PedidoCellInput = z.infer<typeof pedidoCellSchema>;
export type PedidoGarmentLineInput = z.infer<typeof pedidoGarmentLineSchema>;
export type PedidoAdjustmentLineInput = z.infer<typeof pedidoAdjustmentLineSchema>;
export type PedidoLineInput = z.infer<typeof pedidoLineSchema>;
export type CreatePedidoInput = z.infer<typeof createPedidoSchema>;
export type EditPedidoInput = z.infer<typeof editPedidoSchema>;
export type PedidoClientInput = z.infer<typeof pedidoClientSchema>;
