"use server";

/**
 * Pedido create / edit — T116 (spec §3.1, §3.8)
 *
 * createPedido / updatePedido:  admin, cashier, secretary
 *   - line prices: only admin and cashier may differ from the selling price
 *     (with a reason); adjustment lines are price edits too
 *   - client pedidos need a saved client with a phone (no guests)
 *   - the total is never sent: it is always Σ lines (computePedidoTotal)
 *   - no business-day dependency (spec §3.7); the log entry records the day
 *     if one is open
 * updatePedido here is the pre-production edit: once any unit of the pedido
 * is assigned, the production edit rules of T119 apply instead.
 * searchPedidoClients / createPedidoClient: the picker in the same form.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import {
  assignments,
  clients,
  clothPieces,
  clothPieceVariants,
  garmentColors,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidos,
} from "@befine/db/schema";
import { computePedidoTotal, formatPedidoNumber, formatPesos, lineUnits } from "@befine/db";
import {
  createPedidoSchema,
  editPedidoSchema,
  pedidoClientSchema,
  type CreatePedidoInput,
} from "@befine/types";
import type { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getEmployeeRef } from "@/lib/employee-ref";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";
import { resolveLinePrice } from "@/lib/pedido-line-pricing";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PedidoFormVariant = {
  id: string;
  pieceName: string;
  variantName: string;
  sellingPrice: number | null;
  isActive: boolean;
};

export type PedidoFormOption = { id: string; label: string; isActive: boolean };
export type PedidoFormColor = PedidoFormOption & { hex: string | null };

export type PedidoFormData = {
  variants: PedidoFormVariant[];
  sizes: PedidoFormOption[];
  colors: PedidoFormColor[];
  canEditPrices: boolean;
};

export type PedidoClientOption = { id: string; name: string; phone: string | null };

export type PedidoForEdit = {
  id: string;
  number: number;
  version: number;
  destination: "client" | "inventory";
  client: PedidoClientOption | null;
  estimatedDeliveryDate: string | null;
  notes: string | null;
  lines: CreatePedidoInput["lines"];
};

type Fail = Extract<ActionResult<never>, { success: false }>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requirePedidoRole(): Promise<
  | Fail
  | {
      user: { id: string; role?: string | null };
      employeeId: string;
      canEditPrices: boolean;
    }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "cashier", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const emp = await getEmployeeRef(session.user.id);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  return {
    user: session.user,
    employeeId: emp.id,
    canEditPrices: hasRole(session.user, "admin", "cashier"),
  };
}

function validationError(error: z.ZodError): Fail {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Datos inválidos",
      details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    },
  };
}

const fieldError = (field: string, message: string): Fail => ({
  success: false,
  error: { code: "VALIDATION_ERROR", message, details: [{ field, message }] },
});

/** Bogotá calendar date → stored timestamp (start of that day, UTC-5). */
function deliveryTimestamp(date: string | undefined): Date | null {
  return date ? new Date(`${date}T00:00:00-05:00`) : null;
}

/** Stored timestamp → Bogotá calendar date YYYY-MM-DD. */
function deliveryDate(at: Date | null): string | null {
  if (!at) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(at);
}

class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

class ConflictError extends Error {
  constructor(
    readonly code: "CONFLICT" | "STALE_DATA" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

type ResolvedLine =
  | {
      kind: "garment";
      id?: string;
      clothPieceVariantId: string;
      colorId: string | null;
      colorOther: string | null;
      style: string | null;
      instructions: string | null;
      unitPrice: number;
      priceReason: string | null;
      cells: { sizeId: string | null; sizeOther: string | null; quantity: number }[];
    }
  | { kind: "adjustment"; id?: string; amount: number; priceReason: string };

type ExistingLine = {
  id: string;
  kind: "garment" | "adjustment";
  clothPieceVariantId: string | null;
  colorId: string | null;
  unitPrice: number | null;
  priceReason: string | null;
  amount: number | null;
  sizeIds: string[];
};

/**
 * Checks every line against the catalog and the price rules. New lines may
 * only use active variants, sizes and colours; a line being edited may keep
 * one that was deactivated since (deactivated entries stay on records).
 */
async function resolveLines(
  tx: ActivityTx,
  lines: CreatePedidoInput["lines"],
  canEditPrices: boolean,
  existing: ExistingLine[] = [],
): Promise<ResolvedLine[]> {
  const byId = new Map(existing.map((l) => [l.id, l]));
  const garments = lines.filter((l) => l.kind === "garment");

  const variantIds = [...new Set(garments.map((l) => l.clothPieceVariantId))];
  const colorIds = [...new Set(garments.flatMap((l) => (l.colorId ? [l.colorId] : [])))];
  const sizeIds = [
    ...new Set(garments.flatMap((l) => l.cells.flatMap((c) => (c.sizeId ? [c.sizeId] : [])))),
  ];

  const [variantRows, colorRows, sizeRows] = await Promise.all([
    variantIds.length
      ? tx
          .select({
            id: clothPieceVariants.id,
            sellingPrice: clothPieceVariants.sellingPrice,
            isActive: sql<boolean>`${clothPieceVariants.isActive} AND ${clothPieces.isActive}`,
          })
          .from(clothPieceVariants)
          .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
          .where(inArray(clothPieceVariants.id, variantIds))
      : [],
    colorIds.length
      ? tx
          .select({ id: garmentColors.id, isActive: garmentColors.isActive })
          .from(garmentColors)
          .where(inArray(garmentColors.id, colorIds))
      : [],
    sizeIds.length
      ? tx
          .select({ id: garmentSizes.id, isActive: garmentSizes.isActive })
          .from(garmentSizes)
          .where(inArray(garmentSizes.id, sizeIds))
      : [],
  ]);
  const variants = new Map(variantRows.map((v) => [v.id, v]));
  const colors = new Map(colorRows.map((c) => [c.id, c]));
  const sizes = new Map(sizeRows.map((s) => [s.id, s]));

  return lines.map((line, i): ResolvedLine => {
    const prev = line.id ? byId.get(line.id) : undefined;
    if ((line.id && !prev) || (prev && prev.kind !== line.kind))
      throw new InputError(`lines.${i}`, "La línea ya no existe. Recarga el pedido.");

    if (line.kind === "adjustment") {
      const unchanged =
        prev && prev.amount === line.amount && prev.priceReason === line.priceReason;
      if (!canEditPrices && !unchanged)
        throw new InputError(
          `lines.${i}.amount`,
          "Solo administración o caja pueden agregar o cambiar ajustes de precio.",
        );
      return {
        kind: "adjustment",
        id: line.id,
        amount: line.amount,
        priceReason: line.priceReason,
      };
    }

    const sameVariant = prev?.clothPieceVariantId === line.clothPieceVariantId;
    const variant = variants.get(line.clothPieceVariantId);
    if (!variant || (!variant.isActive && !sameVariant))
      throw new InputError(`lines.${i}.clothPieceVariantId`, "La prenda no está disponible.");

    if (line.colorId) {
      const color = colors.get(line.colorId);
      if (!color || (!color.isActive && prev?.colorId !== line.colorId))
        throw new InputError(`lines.${i}.colorId`, "El color no está disponible.");
    }
    for (const [j, cell] of line.cells.entries()) {
      if (!cell.sizeId) continue;
      const size = sizes.get(cell.sizeId);
      if (!size || (!size.isActive && !prev?.sizeIds.includes(cell.sizeId)))
        throw new InputError(`lines.${i}.cells.${j}.sizeId`, "La talla no está disponible.");
    }

    const price = resolveLinePrice({
      unitPrice: line.unitPrice,
      priceReason: line.priceReason,
      sellingPrice: variant.sellingPrice,
      canEditPrices,
      existing:
        sameVariant && prev?.unitPrice != null
          ? { unitPrice: prev.unitPrice, priceReason: prev.priceReason }
          : undefined,
    });
    if (!price.ok) throw new InputError(`lines.${i}.unitPrice`, price.message);

    return {
      kind: "garment",
      id: line.id,
      clothPieceVariantId: line.clothPieceVariantId,
      colorId: line.colorId ?? null,
      colorOther: line.colorOther ?? null,
      style: line.style ?? null,
      instructions: line.instructions ?? null,
      unitPrice: price.unitPrice,
      priceReason: price.priceReason,
      cells: line.cells.map((c) => ({
        sizeId: c.sizeId ?? null,
        sizeOther: c.sizeOther ?? null,
        quantity: c.quantity,
      })),
    };
  });
}

/** Client pedidos need an active saved client with a phone; saves the phone if given. */
async function resolveClient(
  tx: ActivityTx,
  input: { destination: "client" | "inventory"; clientId?: string; clientPhone?: string },
  actor: ReturnType<typeof actorOf>,
): Promise<{ id: string; name: string } | null> {
  if (input.destination === "inventory") return null;
  const [client] = await tx
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      isActive: clients.isActive,
    })
    .from(clients)
    .where(eq(clients.id, input.clientId!))
    .for("update");
  if (!client || !client.isActive)
    throw new InputError("clientId", "El cliente no está disponible.");
  if (!client.phone?.trim()) {
    const phone = input.clientPhone?.trim();
    if (!phone) throw new InputError("clientPhone", "Este cliente no tiene teléfono: agrégalo.");
    const check = pedidoClientSchema.shape.phone.safeParse(phone);
    if (!check.success) throw new InputError("clientPhone", check.error.issues[0]!.message);
    await tx
      .update(clients)
      .set({ phone: check.data, updatedAt: new Date() })
      .where(eq(clients.id, client.id));
    await logActivity(tx, {
      actor,
      action: "client.update",
      entityType: "client",
      entityId: client.id,
      data: { name: client.name },
      before: { phone: client.phone },
      after: { phone: check.data },
    });
  }
  return { id: client.id, name: client.name };
}

async function insertLines(tx: ActivityTx, pedidoId: string, lines: ResolvedLine[]) {
  for (const [position, line] of lines.entries()) {
    const [row] = await tx
      .insert(pedidoLines)
      .values(
        line.kind === "garment"
          ? {
              ...(line.id ? { id: line.id } : {}),
              pedidoId,
              kind: "garment",
              position,
              clothPieceVariantId: line.clothPieceVariantId,
              colorId: line.colorId,
              colorOther: line.colorOther,
              style: line.style,
              instructions: line.instructions,
              unitPrice: line.unitPrice,
              priceReason: line.priceReason,
            }
          : {
              ...(line.id ? { id: line.id } : {}),
              pedidoId,
              kind: "adjustment",
              position,
              amount: line.amount,
              priceReason: line.priceReason,
            },
      )
      .returning({ id: pedidoLines.id });
    if (line.kind === "garment")
      await tx.insert(pedidoLineCells).values(line.cells.map((c) => ({ lineId: row.id, ...c })));
  }
}

function summarize(lines: ResolvedLine[]) {
  const total = computePedidoTotal(
    lines.map((l) =>
      l.kind === "garment"
        ? { kind: "garment" as const, unitPrice: l.unitPrice, cells: l.cells }
        : { kind: "adjustment" as const, amount: l.amount },
    ),
  );
  const units = lines.reduce((n, l) => (l.kind === "garment" ? n + lineUnits(l.cells) : n), 0);
  const reasons = lines.flatMap((l) => (l.priceReason ? [l.priceReason] : []));
  return { total, units, reasons };
}

function snapshot(
  input: { destination: string; estimatedDeliveryDate?: string; notes?: string },
  clientName: string | null,
  lines: ResolvedLine[],
) {
  const { total, units } = summarize(lines);
  return {
    destination: input.destination,
    client: clientName,
    estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
    notes: input.notes ?? null,
    total,
    units,
    lines,
  };
}

function toFail(err: unknown): Fail | null {
  if (err instanceof InputError) return fieldError(err.field, err.message);
  if (err instanceof ConflictError)
    return { success: false, error: { code: err.code, message: err.message } };
  return null;
}

// ─── Form data ───────────────────────────────────────────────────────────────

export async function getPedidoFormData(): Promise<ActionResult<PedidoFormData>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;

  const db = getDb();
  const [variantRows, sizeRows, colorRows] = await Promise.all([
    db
      .select({
        id: clothPieceVariants.id,
        pieceName: clothPieces.name,
        variantName: clothPieceVariants.name,
        sellingPrice: clothPieceVariants.sellingPrice,
        isActive: sql<boolean>`${clothPieceVariants.isActive} AND ${clothPieces.isActive}`,
      })
      .from(clothPieceVariants)
      .innerJoin(clothPieces, eq(clothPieceVariants.clothPieceId, clothPieces.id))
      .orderBy(asc(clothPieces.name), asc(clothPieceVariants.name)),
    db
      .select({ id: garmentSizes.id, label: garmentSizes.label, isActive: garmentSizes.isActive })
      .from(garmentSizes)
      .orderBy(asc(garmentSizes.sortOrder), asc(garmentSizes.label)),
    db
      .select({
        id: garmentColors.id,
        label: garmentColors.label,
        hex: garmentColors.hex,
        isActive: garmentColors.isActive,
      })
      .from(garmentColors)
      .orderBy(asc(garmentColors.label)),
  ]);

  return {
    success: true,
    data: {
      variants: variantRows,
      sizes: sizeRows,
      colors: colorRows,
      canEditPrices: guard.canEditPrices,
    },
  };
}

// ─── Client picker ───────────────────────────────────────────────────────────

export async function searchPedidoClients(
  query: string,
): Promise<ActionResult<PedidoClientOption[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (q.length < 2) return { success: true, data: [] };

  const term = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await getDb()
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(
      and(eq(clients.isActive, true), or(ilike(clients.name, term), ilike(clients.phone, term))),
    )
    .orderBy(asc(clients.name))
    .limit(20);
  return { success: true, data: rows };
}

export async function createPedidoClient(
  rawInput: unknown,
): Promise<ActionResult<PedidoClientOption>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = pedidoClientSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const client = await getTxDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({ name: parsed.data.name, phone: parsed.data.phone })
      .returning({ id: clients.id, name: clients.name, phone: clients.phone });
    await logActivity(tx, {
      actor: actorOf(guard.user),
      action: "client.create",
      entityType: "client",
      entityId: row.id,
      data: { name: row.name },
      after: parsed.data,
    });
    return row;
  });
  return { success: true, data: client };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPedido(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; number: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = createPedidoSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const actor = actorOf(guard.user);

  try {
    const created = await getTxDb().transaction(async (tx) => {
      const client = await resolveClient(tx, input, actor);
      const lines = await resolveLines(tx, input.lines, guard.canEditPrices);

      const [pedido] = await tx
        .insert(pedidos)
        .values({
          destination: input.destination,
          clientId: client?.id ?? null,
          estimatedDeliveryAt: deliveryTimestamp(input.estimatedDeliveryDate),
          notes: input.notes ?? null,
          createdBy: guard.employeeId,
        })
        .returning({ id: pedidos.id, number: pedidos.number });
      await insertLines(tx, pedido.id, lines);

      const { total, units, reasons } = summarize(lines);
      const number = formatPedidoNumber(pedido.number);
      await logActivity(tx, {
        actor,
        action: "pedido.create",
        entityType: "pedido",
        entityId: pedido.id,
        summary: `Creó el pedido ${number} ${client ? `para ${client.name}` : "para inventario"} · ${units} ${units === 1 ? "unidad" : "unidades"} · ${formatPesos(total)}`,
        after: snapshot(input, client?.name ?? null, lines),
        reason: reasons.length ? reasons.join(" · ") : null,
      });
      return pedido;
    });

    revalidatePath("/pedidos");
    return { success: true, data: created };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Edit (before production) ────────────────────────────────────────────────

export async function getPedidoForEdit(id: string): Promise<ActionResult<PedidoForEdit>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  const db = getDb();
  const [pedido] = await db
    .select({
      id: pedidos.id,
      number: pedidos.number,
      version: pedidos.version,
      destination: pedidos.destination,
      estimatedDeliveryAt: pedidos.estimatedDeliveryAt,
      notes: pedidos.notes,
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
    })
    .from(pedidos)
    .leftJoin(clients, eq(pedidos.clientId, clients.id))
    .where(eq(pedidos.id, id))
    .limit(1);
  if (!pedido)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };

  const lineRows = await db
    .select()
    .from(pedidoLines)
    .where(eq(pedidoLines.pedidoId, id))
    .orderBy(asc(pedidoLines.position));
  const cellRows = lineRows.length
    ? await db
        .select()
        .from(pedidoLineCells)
        .where(
          inArray(
            pedidoLineCells.lineId,
            lineRows.map((l) => l.id),
          ),
        )
        .orderBy(asc(pedidoLineCells.createdAt))
    : [];

  return {
    success: true,
    data: {
      id: pedido.id,
      number: pedido.number,
      version: pedido.version,
      destination: pedido.destination,
      client: pedido.clientId
        ? { id: pedido.clientId, name: pedido.clientName!, phone: pedido.clientPhone }
        : null,
      estimatedDeliveryDate: deliveryDate(pedido.estimatedDeliveryAt),
      notes: pedido.notes,
      lines: lineRows.map((l) =>
        l.kind === "adjustment"
          ? {
              kind: "adjustment" as const,
              id: l.id,
              amount: l.amount!,
              priceReason: l.priceReason!,
            }
          : {
              kind: "garment" as const,
              id: l.id,
              clothPieceVariantId: l.clothPieceVariantId!,
              colorId: l.colorId ?? undefined,
              colorOther: l.colorOther ?? undefined,
              style: l.style ?? undefined,
              instructions: l.instructions ?? undefined,
              unitPrice: l.unitPrice!,
              priceReason: l.priceReason ?? undefined,
              cells: cellRows
                .filter((c) => c.lineId === l.id)
                .map((c) => ({
                  sizeId: c.sizeId ?? undefined,
                  sizeOther: c.sizeOther ?? undefined,
                  quantity: c.quantity,
                })),
            },
      ),
    },
  };
}

export async function updatePedido(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string; number: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = editPedidoSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const actor = actorOf(guard.user);

  try {
    const result = await getTxDb().transaction(async (tx) => {
      const [pedido] = await tx
        .select({
          id: pedidos.id,
          number: pedidos.number,
          version: pedidos.version,
          cancelledAt: pedidos.cancelledAt,
          destination: pedidos.destination,
          clientId: pedidos.clientId,
          estimatedDeliveryAt: pedidos.estimatedDeliveryAt,
          notes: pedidos.notes,
        })
        .from(pedidos)
        .where(eq(pedidos.id, id))
        .for("update");
      if (!pedido) throw new ConflictError("NOT_FOUND", "Pedido no encontrado");
      if (pedido.version !== input.version)
        throw new ConflictError(
          "STALE_DATA",
          "Alguien más cambió este pedido. Recarga para ver la última versión.",
        );
      if (pedido.cancelledAt)
        throw new ConflictError("CONFLICT", "El pedido está cancelado y no se puede editar.");

      const existingLines = await tx
        .select({
          id: pedidoLines.id,
          kind: pedidoLines.kind,
          clothPieceVariantId: pedidoLines.clothPieceVariantId,
          colorId: pedidoLines.colorId,
          unitPrice: pedidoLines.unitPrice,
          priceReason: pedidoLines.priceReason,
          amount: pedidoLines.amount,
        })
        .from(pedidoLines)
        .where(eq(pedidoLines.pedidoId, id));
      const lineIds = existingLines.map((l) => l.id);
      const existingCells = lineIds.length
        ? await tx
            .select({
              id: pedidoLineCells.id,
              lineId: pedidoLineCells.lineId,
              sizeId: pedidoLineCells.sizeId,
              quantity: pedidoLineCells.quantity,
            })
            .from(pedidoLineCells)
            .where(inArray(pedidoLineCells.lineId, lineIds))
        : [];

      if (existingCells.length) {
        const [started] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(assignments)
          .where(
            inArray(
              assignments.cellId,
              existingCells.map((c) => c.id),
            ),
          );
        if (Number(started?.n ?? 0) > 0)
          throw new ConflictError(
            "CONFLICT",
            "Este pedido ya está en producción: los cambios siguen las reglas de producción.",
          );
      }

      const client = await resolveClient(tx, input, actor);
      const lines = await resolveLines(
        tx,
        input.lines,
        guard.canEditPrices,
        existingLines.map((l) => ({
          ...l,
          sizeIds: existingCells.flatMap((c) => (c.lineId === l.id && c.sizeId ? [c.sizeId] : [])),
        })),
      );

      const before = {
        destination: pedido.destination,
        clientId: pedido.clientId,
        estimatedDeliveryDate: deliveryDate(pedido.estimatedDeliveryAt),
        notes: pedido.notes,
        total: computePedidoTotal(
          existingLines.map((l) =>
            l.kind === "adjustment"
              ? { kind: "adjustment" as const, amount: l.amount! }
              : {
                  kind: "garment" as const,
                  unitPrice: l.unitPrice!,
                  cells: existingCells.filter((c) => c.lineId === l.id),
                },
          ),
        ),
        units: existingCells.reduce((n, c) => n + c.quantity, 0),
      };

      // Nothing is assigned, so the size grid can be rewritten. Line ids are
      // kept for lines that stay, so their price snapshot keeps its history.
      if (lineIds.length) {
        await tx.delete(pedidoLineCells).where(inArray(pedidoLineCells.lineId, lineIds));
        await tx.delete(pedidoLines).where(eq(pedidoLines.pedidoId, id));
      }
      await insertLines(tx, id, lines);

      const [updated] = await tx
        .update(pedidos)
        .set({
          destination: input.destination,
          clientId: client?.id ?? null,
          estimatedDeliveryAt: deliveryTimestamp(input.estimatedDeliveryDate),
          notes: input.notes ?? null,
          version: sql`${pedidos.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(pedidos.id, id), eq(pedidos.version, input.version)))
        .returning({ id: pedidos.id, number: pedidos.number });
      if (!updated)
        throw new ConflictError(
          "STALE_DATA",
          "Alguien más cambió este pedido. Recarga para ver la última versión.",
        );

      const after = snapshot(input, client?.name ?? null, lines);
      const { reasons } = summarize(lines);
      const totalNote =
        before.total !== after.total
          ? ` · total ${formatPesos(before.total)} → ${formatPesos(after.total)}`
          : "";
      await logActivity(tx, {
        actor,
        action: "pedido.update",
        entityType: "pedido",
        entityId: id,
        summary: `Editó el pedido ${formatPedidoNumber(updated.number)}${totalNote}`,
        before,
        after,
        reason: reasons.length ? reasons.join(" · ") : null,
      });
      return updated;
    });

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${id}`);
    return { success: true, data: result };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── List (basic; filters and derived status come with T117/T118) ────────────

export type PedidoListRow = {
  id: string;
  number: number;
  destination: "client" | "inventory";
  clientName: string | null;
  units: number;
  total: number;
  estimatedDeliveryDate: string | null;
  cancelled: boolean;
  createdAt: Date;
};

export async function listPedidos(): Promise<ActionResult<PedidoListRow[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;

  const units = sql<number>`coalesce((
    SELECT sum(c.quantity) FROM pedido_line_cells c
    JOIN pedido_lines l ON l.id = c.line_id WHERE l.pedido_id = ${pedidos.id}
  ), 0)::int`;
  const total = sql<number>`coalesce((
    SELECT sum(CASE WHEN l.kind = 'adjustment' THEN l.amount
      ELSE l.unit_price * (SELECT coalesce(sum(c.quantity), 0) FROM pedido_line_cells c WHERE c.line_id = l.id) END)
    FROM pedido_lines l WHERE l.pedido_id = ${pedidos.id}
  ), 0)::bigint`;

  const rows = await getDb()
    .select({
      id: pedidos.id,
      number: pedidos.number,
      destination: pedidos.destination,
      clientName: clients.name,
      units,
      total,
      estimatedDeliveryAt: pedidos.estimatedDeliveryAt,
      cancelledAt: pedidos.cancelledAt,
      createdAt: pedidos.createdAt,
    })
    .from(pedidos)
    .leftJoin(clients, eq(pedidos.clientId, clients.id))
    .orderBy(sql`${pedidos.number} DESC`)
    .limit(200);

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      number: r.number,
      destination: r.destination,
      clientName: r.clientName,
      units: Number(r.units),
      total: Number(r.total),
      estimatedDeliveryDate: deliveryDate(r.estimatedDeliveryAt),
      cancelled: r.cancelledAt !== null,
      createdAt: r.createdAt,
    })),
  };
}
