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

import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, getTxDb } from "@/lib/db";
import {
  assignments,
  clients,
  deliveries,
  deliveryCells,
  clothPieces,
  clothPieceVariants,
  garmentColors,
  garmentSizes,
  pedidoLineCells,
  pedidoLines,
  pedidoPayments,
  pedidos,
} from "@befine/db/schema";
import {
  computePedidoTotal,
  formatPedidoNumber,
  formatPesos,
  getPedidoDetail,
  lineUnits,
  listPedidoOverviews,
  type PedidoDetail,
  type PedidoListItem,
} from "@befine/db";
import {
  createPedidoSchema,
  editPedidoSchema,
  pedidoClientSchema,
  cancelPedidoSchema,
  recordDeliverySchema,
  type CreatePedidoInput,
} from "@befine/types";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { financialBreadcrumb, reportError } from "@/lib/observability";
import { hasRole } from "@/lib/middleware-helpers";
import { getBusinessSettings } from "@/lib/business-settings";
import { actorOf, logActivity, type ActivityTx } from "@/lib/activity";
import { resolveLinePrice } from "@/lib/pedido-line-pricing";
import {
  ConflictError,
  fieldError,
  InputError,
  requirePedidoRole,
  toFail,
  validationError,
} from "./action-helpers";
import { createNotification } from "@/lib/notifications";
import {
  lineIsStarted,
  minimumQuantity,
  planPedidoEdit,
  type ExistingLine as PlanExistingLine,
} from "@/lib/pedido-edit-plan";

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
  cancelled: boolean;
  /** Any unit assigned/approved/delivered: production edit rules apply (T119) */
  started: boolean;
  /** Per garment line: whether it is started and, per size key, the floor for its quantity */
  limits: Record<
    string,
    { started: boolean; cells: Record<string, { min: number; locked: boolean }> }
  >;
  client: PedidoClientOption | null;
  estimatedDeliveryDate: string | null;
  notes: string | null;
  lines: CreatePedidoInput["lines"];
};

/** Bogotá calendar date → stored timestamp (start of that day, UTC-5). */
function deliveryTimestamp(date: string | undefined): Date | null {
  return date ? new Date(`${date}T00:00:00-05:00`) : null;
}

/** Stored timestamp → Bogotá calendar date YYYY-MM-DD. */
function deliveryDate(at: Date | null): string | null {
  if (!at) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(at);
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

async function insertLines(
  tx: ActivityTx,
  pedidoId: string,
  lines: ResolvedLine[],
  firstPosition = 0,
) {
  for (const [i, line] of lines.entries()) {
    const position = firstPosition + i;
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
    financialBreadcrumb("createPedido", { pedidoId: created.id, number: created.number });
    return { success: true, data: created };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Edit (T116 + production rules T119) ─────────────────────────────────────

type CellState = {
  cellId: string;
  assigned: number;
  approved: number;
  delivered: number;
  hasHistory: boolean;
};

/** Work done on each cell of a pedido: what limits how its lines can change. */
async function loadCellStates(tx: ActivityTx, pedidoId: string) {
  const rows = await tx.execute<{
    cell_id: string;
    assigned: number;
    approved: number;
    delivered: number;
    has_history: boolean;
  }>(sql`
    SELECT c.id AS cell_id,
      (coalesce((SELECT sum(a.quantity) FROM assignments a WHERE a.cell_id = c.id), 0)
        - coalesce((SELECT sum(r.scrapped) FROM unit_reviews r JOIN assignments a ON a.id = r.assignment_id WHERE a.cell_id = c.id), 0))::int AS assigned,
      coalesce((SELECT sum(r.approved) FROM unit_reviews r JOIN assignments a ON a.id = r.assignment_id WHERE a.cell_id = c.id), 0)::int AS approved,
      coalesce((SELECT sum(dc.quantity) FROM delivery_cells dc WHERE dc.cell_id = c.id), 0)::int AS delivered,
      (EXISTS (SELECT 1 FROM unit_reports r JOIN assignments a ON a.id = r.assignment_id WHERE a.cell_id = c.id)
        OR EXISTS (SELECT 1 FROM delivery_cells dc WHERE dc.cell_id = c.id)) AS has_history
    FROM pedido_line_cells c JOIN pedido_lines l ON l.id = c.line_id
    WHERE l.pedido_id = ${pedidoId}
  `);
  type Row = {
    cell_id: string;
    assigned: number;
    approved: number;
    delivered: number;
    has_history: boolean;
  };
  return new Map<string, CellState>(
    (rows.rows as Row[]).map((r) => [
      r.cell_id,
      {
        cellId: r.cell_id,
        assigned: Number(r.assigned),
        approved: Number(r.approved),
        delivered: Number(r.delivered),
        hasHistory: Boolean(r.has_history),
      },
    ]),
  );
}

/** Stored lines + cells + work done, in the planner's shape. */
async function loadExistingLines(tx: ActivityTx, pedidoId: string): Promise<PlanExistingLine[]> {
  const lineRows = await tx
    .select()
    .from(pedidoLines)
    .where(eq(pedidoLines.pedidoId, pedidoId))
    .orderBy(asc(pedidoLines.position));
  const cellRows = lineRows.length
    ? await tx
        .select({
          id: pedidoLineCells.id,
          lineId: pedidoLineCells.lineId,
          sizeId: pedidoLineCells.sizeId,
          sizeOther: pedidoLineCells.sizeOther,
          sizeLabel: garmentSizes.label,
          quantity: pedidoLineCells.quantity,
        })
        .from(pedidoLineCells)
        .leftJoin(garmentSizes, eq(pedidoLineCells.sizeId, garmentSizes.id))
        .where(
          inArray(
            pedidoLineCells.lineId,
            lineRows.map((l) => l.id),
          ),
        )
        .orderBy(asc(pedidoLineCells.createdAt))
    : [];
  const states = cellRows.length ? await loadCellStates(tx, pedidoId) : new Map();

  return lineRows.map(
    (l): PlanExistingLine =>
      l.kind === "adjustment"
        ? { id: l.id, kind: "adjustment", amount: l.amount!, priceReason: l.priceReason! }
        : {
            id: l.id,
            kind: "garment",
            clothPieceVariantId: l.clothPieceVariantId!,
            colorId: l.colorId,
            colorOther: l.colorOther,
            style: l.style,
            instructions: l.instructions,
            unitPrice: l.unitPrice!,
            priceReason: l.priceReason,
            cells: cellRows
              .filter((c) => c.lineId === l.id)
              .map((c) => {
                const st = states.get(c.id);
                return {
                  id: c.id,
                  sizeId: c.sizeId,
                  sizeOther: c.sizeOther,
                  label: c.sizeLabel ?? c.sizeOther ?? "—",
                  quantity: c.quantity,
                  assigned: st?.assigned ?? 0,
                  approved: st?.approved ?? 0,
                  delivered: st?.delivered ?? 0,
                  hasHistory: st?.hasHistory ?? false,
                };
              }),
          },
  );
}

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
      cancelledAt: pedidos.cancelledAt,
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

  // Reads only: the HTTP driver has the same query API as a transaction.
  const existing = await loadExistingLines(db as unknown as ActivityTx, id);
  const limits: PedidoForEdit["limits"] = {};
  for (const l of existing)
    if (l.kind === "garment")
      limits[l.id] = {
        started: lineIsStarted(l),
        cells: Object.fromEntries(
          l.cells.map((c) => [
            c.sizeId ?? `other:${(c.sizeOther ?? "").toLowerCase()}`,
            {
              min: minimumQuantity(c),
              locked: minimumQuantity(c) > 0 || c.hasHistory,
            },
          ]),
        ),
      };

  return {
    success: true,
    data: {
      id: pedido.id,
      number: pedido.number,
      version: pedido.version,
      destination: pedido.destination,
      cancelled: pedido.cancelledAt !== null,
      started: Object.values(limits).some((l) => l.started),
      limits,
      client: pedido.clientId
        ? { id: pedido.clientId, name: pedido.clientName!, phone: pedido.clientPhone }
        : null,
      estimatedDeliveryDate: deliveryDate(pedido.estimatedDeliveryAt),
      notes: pedido.notes,
      lines: existing.map((l) =>
        l.kind === "adjustment"
          ? { kind: "adjustment" as const, id: l.id, amount: l.amount, priceReason: l.priceReason }
          : {
              kind: "garment" as const,
              id: l.id,
              clothPieceVariantId: l.clothPieceVariantId,
              colorId: l.colorId ?? undefined,
              colorOther: l.colorOther ?? undefined,
              style: l.style ?? undefined,
              instructions: l.instructions ?? undefined,
              unitPrice: l.unitPrice,
              priceReason: l.priceReason ?? undefined,
              changeReason: undefined,
              cells: l.cells.map((c) => ({
                sizeId: c.sizeId ?? undefined,
                sizeOther: c.sizeOther ?? undefined,
                quantity: c.quantity,
              })),
            },
      ),
    },
  };
}

/** Clothiers still holding units on these lines (for "Cambió: …" notices). */
async function clothiersOnLines(tx: ActivityTx, lineIds: string[]): Promise<string[]> {
  if (!lineIds.length) return [];
  const rows = await tx.execute<{ employee_id: string }>(sql`
    SELECT DISTINCT a.employee_id
    FROM assignments a
    JOIN pedido_line_cells c ON c.id = a.cell_id
    WHERE c.line_id IN (${sql.join(
      lineIds.map((l) => sql`${l}`),
      sql`, `,
    )})
      AND a.quantity - coalesce((SELECT sum(r.scrapped) FROM unit_reviews r WHERE r.assignment_id = a.id), 0) > 0
  `);
  return (rows.rows as { employee_id: string }[]).map((r) => r.employee_id);
}

export async function updatePedido(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string; number: number; saldoAFavor: number }>> {
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
  let notices: { employeeIds: string[]; message: string }[] = [];

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

      const existing = await loadExistingLines(tx, id);
      const started = existing.some((l) => l.kind === "garment" && lineIsStarted(l));
      if (started && input.destination !== pedido.destination)
        throw new InputError(
          "destination",
          "El pedido ya está en producción: no se puede cambiar entre cliente e inventario.",
        );

      const client = await resolveClient(tx, input, actor);
      const lines = await resolveLines(
        tx,
        input.lines,
        guard.canEditPrices,
        existing.map((l) =>
          l.kind === "adjustment"
            ? {
                id: l.id,
                kind: l.kind,
                clothPieceVariantId: null,
                colorId: null,
                unitPrice: null,
                priceReason: l.priceReason,
                amount: l.amount,
                sizeIds: [],
              }
            : {
                id: l.id,
                kind: l.kind,
                clothPieceVariantId: l.clothPieceVariantId,
                colorId: l.colorId,
                unitPrice: l.unitPrice,
                priceReason: l.priceReason,
                amount: null,
                sizeIds: l.cells.flatMap((c) => (c.sizeId ? [c.sizeId] : [])),
              },
        ),
      );

      const colorRows = await tx
        .select({ id: garmentColors.id, label: garmentColors.label })
        .from(garmentColors);
      const colorLabel = new Map(colorRows.map((c) => [c.id, c.label]));
      const planned = planPedidoEdit(
        existing,
        lines.map((l, i) => {
          const raw = input.lines[i]!;
          return l.kind === "garment" && raw.kind === "garment"
            ? { ...l, changeReason: raw.changeReason ?? null }
            : l;
        }),
        (cid, other) => other ?? (cid ? (colorLabel.get(cid) ?? "—") : "sin color"),
      );
      if (!planned.ok) {
        const first = planned.errors[0]!;
        throw new InputError(first.field, planned.errors.map((e) => e.message).join(" "));
      }
      const { plan } = planned;

      // Paid so far, to report saldo a favor when the total drops below it.
      const [{ paid }] = await tx
        .select({ paid: sql<number>`coalesce(sum(${pedidoPayments.amount}), 0)::bigint` })
        .from(pedidoPayments)
        .where(eq(pedidoPayments.pedidoId, id));

      const before = {
        destination: pedido.destination,
        clientId: pedido.clientId,
        estimatedDeliveryDate: deliveryDate(pedido.estimatedDeliveryAt),
        notes: pedido.notes,
        total: computePedidoTotal(
          existing.map((l) =>
            l.kind === "adjustment"
              ? { kind: "adjustment" as const, amount: l.amount }
              : { kind: "garment" as const, unitPrice: l.unitPrice, cells: l.cells },
          ),
        ),
        units: existing.reduce((n, l) => (l.kind === "garment" ? n + lineUnits(l.cells) : n), 0),
        lines: existing,
      };

      // Writes: deletions first (cells, then their lines), then updates, then inserts.
      if (plan.deleteCellIds.length) {
        // Released assignments with no work on them carry nothing worth keeping.
        await tx
          .delete(assignments)
          .where(and(inArray(assignments.cellId, plan.deleteCellIds), eq(assignments.quantity, 0)));
        await tx.delete(pedidoLineCells).where(inArray(pedidoLineCells.id, plan.deleteCellIds));
      }
      if (plan.deleteLineIds.length)
        await tx.delete(pedidoLines).where(inArray(pedidoLines.id, plan.deleteLineIds));

      const now = new Date();
      for (const u of plan.updateLines) {
        const l = u.line;
        await tx
          .update(pedidoLines)
          .set(
            l.kind === "garment"
              ? {
                  position: u.position,
                  clothPieceVariantId: l.clothPieceVariantId,
                  colorId: l.colorId,
                  colorOther: l.colorOther,
                  style: l.style,
                  instructions: l.instructions,
                  unitPrice: l.unitPrice,
                  priceReason: l.priceReason,
                  ...(u.specChange
                    ? {
                        specChange: { ...u.specChange, by: actor.userId },
                        specChangedAt: now,
                      }
                    : {}),
                  updatedAt: now,
                }
              : {
                  position: u.position,
                  amount: l.amount,
                  priceReason: l.priceReason,
                  updatedAt: now,
                },
          )
          .where(eq(pedidoLines.id, u.id));
      }
      // Raise before lowering is irrelevant here: the guard trigger checks each
      // cell against its own assignments only.
      for (const c of plan.updateCells)
        await tx
          .update(pedidoLineCells)
          .set({ quantity: c.quantity, updatedAt: now })
          .where(eq(pedidoLineCells.id, c.id));
      if (plan.insertCells.length) await tx.insert(pedidoLineCells).values(plan.insertCells);
      for (const ins of plan.insertLines) await insertLines(tx, id, [ins.line], ins.position);

      const [updated] = await tx
        .update(pedidos)
        .set({
          destination: input.destination,
          clientId: client?.id ?? null,
          estimatedDeliveryAt: deliveryTimestamp(input.estimatedDeliveryDate),
          notes: input.notes ?? null,
          version: sql`${pedidos.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(pedidos.id, id), eq(pedidos.version, input.version)))
        .returning({ id: pedidos.id, number: pedidos.number });
      if (!updated)
        throw new ConflictError(
          "STALE_DATA",
          "Alguien más cambió este pedido. Recarga para ver la última versión.",
        );

      const after = snapshot(input, client?.name ?? null, lines);
      const saldoAFavor = Math.max(Number(paid) - after.total, 0);
      const { reasons } = summarize(lines);
      const specChanges = plan.updateLines.filter((u) => u.specChange);
      const number = formatPedidoNumber(updated.number);
      const notes = [
        before.total !== after.total
          ? `total ${formatPesos(before.total)} → ${formatPesos(after.total)}`
          : null,
        before.units !== after.units ? `unidades ${before.units} → ${after.units}` : null,
        ...specChanges.map((u) => `cambió ${u.specChange!.summary}`),
        saldoAFavor > 0 ? `saldo a favor ${formatPesos(saldoAFavor)}` : null,
      ].filter(Boolean);
      await logActivity(tx, {
        actor,
        action: "pedido.update",
        entityType: "pedido",
        entityId: id,
        summary: `Editó el pedido ${number}${notes.length ? ` · ${notes.join(" · ")}` : ""}`,
        before,
        after,
        reason: [...reasons, ...specChanges.map((u) => u.specChange!.reason)].join(" · ") || null,
      });

      notices = await Promise.all(
        specChanges.map(async (u) => ({
          employeeIds: await clothiersOnLines(tx, [u.id]),
          message: `Cambió el pedido ${number}: ${u.specChange!.summary}. Motivo: ${u.specChange!.reason}`,
        })),
      );
      return { ...updated, saldoAFavor };
    });

    // Post-commit: notifications are a side effect; a failure must not undo the edit.
    for (const n of notices)
      for (const employeeId of n.employeeIds)
        await createNotification({
          recipientEmployeeId: employeeId,
          type: "pedido_changed",
          message: n.message,
          link: "/clothier",
        }).catch((err) => reportError(err, "createNotification"));

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${id}`);
    financialBreadcrumb("updatePedido", { pedidoId: id, saldoAFavor: result.saldoAFavor });
    return { success: true, data: result };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Cancel (spec §3.4.18) ───────────────────────────────────────────────────

export async function cancelPedido(
  id: string,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
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
  const parsed = cancelPedidoSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const actor = actorOf(guard.user);
  let released: { employeeIds: string[]; message: string } | null = null;

  try {
    await getTxDb().transaction(async (tx) => {
      const [pedido] = await tx
        .select({
          number: pedidos.number,
          version: pedidos.version,
          cancelledAt: pedidos.cancelledAt,
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
      if (pedido.cancelledAt) throw new ConflictError("CONFLICT", "El pedido ya está cancelado.");

      const states = [...(await loadCellStates(tx, id)).values()];
      if (states.some((s) => s.approved > 0))
        throw new ConflictError(
          "CONFLICT",
          "No se puede cancelar: hay unidades aprobadas. Usa una reestructuración aprobada por administración.",
        );
      const [pending] = await tx
        .execute<{ n: number }>(
          sql`
        SELECT coalesce(sum(r.quantity), 0)::int - coalesce((
          SELECT sum(v.approved + v.returned + v.scrapped) FROM unit_reviews v
          JOIN assignments a2 ON a2.id = v.assignment_id
          JOIN pedido_line_cells c2 ON c2.id = a2.cell_id JOIN pedido_lines l2 ON l2.id = c2.line_id
          WHERE l2.pedido_id = ${id}), 0)::int AS n
        FROM unit_reports r JOIN assignments a ON a.id = r.assignment_id
        JOIN pedido_line_cells c ON c.id = a.cell_id JOIN pedido_lines l ON l.id = c.line_id
        WHERE l.pedido_id = ${id}
      `,
        )
        .then((r) => r.rows);
      if (Number(pending?.n ?? 0) > 0)
        throw new ConflictError(
          "CONFLICT",
          "No se puede cancelar: hay unidades reportadas sin revisar. Revísalas primero.",
        );

      const [{ paid }] = await tx
        .select({ paid: sql<number>`coalesce(sum(${pedidoPayments.amount}), 0)::bigint` })
        .from(pedidoPayments)
        .where(eq(pedidoPayments.pedidoId, id));
      if (Number(paid) !== 0 && !input.acknowledgePayments)
        throw new InputError(
          "acknowledgePayments",
          `Este pedido tiene ${formatPesos(Number(paid))} pagados. Confirma que gestionarás la devolución.`,
        );

      // Release units nobody started: the assignment keeps only reported units.
      const lineIds = (
        await tx
          .select({ id: pedidoLines.id })
          .from(pedidoLines)
          .where(eq(pedidoLines.pedidoId, id))
      ).map((l) => l.id);
      const employeeIds = await clothiersOnLines(tx, lineIds);
      if (lineIds.length)
        await tx.execute(sql`
          UPDATE assignments a SET quantity = coalesce((
            SELECT sum(r.quantity) FROM unit_reports r WHERE r.assignment_id = a.id AND r.kind = 'report'
          ), 0), version = a.version + 1, updated_at = now()
          FROM pedido_line_cells c
          WHERE c.id = a.cell_id AND c.line_id IN (${sql.join(
            lineIds.map((l) => sql`${l}`),
            sql`, `,
          )})
        `);

      await tx
        .update(pedidos)
        .set({
          cancelledAt: new Date(),
          cancellationReason: input.reason,
          version: sql`${pedidos.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(pedidos.id, id));

      const number = formatPedidoNumber(pedido.number);
      await logActivity(tx, {
        actor,
        action: "pedido.cancel",
        entityType: "pedido",
        entityId: id,
        summary: `Canceló el pedido ${number}${Number(paid) ? ` · pagado ${formatPesos(Number(paid))} por devolver` : ""}`,
        before: { cancelled: false, paid: Number(paid) },
        after: { cancelled: true, releasedClothiers: employeeIds.length },
        reason: input.reason,
      });
      released = employeeIds.length
        ? {
            employeeIds,
            message: `Se canceló el pedido ${number}. Sus unidades sin empezar ya no son tuyas.`,
          }
        : null;
    });

    const r = released as { employeeIds: string[]; message: string } | null;
    if (r)
      for (const employeeId of r.employeeIds)
        await createNotification({
          recipientEmployeeId: employeeId,
          type: "pedido_changed",
          message: r.message,
          link: "/clothier",
        }).catch((err) => reportError(err, "createNotification"));

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${id}`);
    financialBreadcrumb("cancelPedido", { pedidoId: id });
    return { success: true, data: { id } };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── Deliveries (T121, spec §3.3.15) ────────────────────────────────────────

/** Bogotá calendar date of "now". */
function todayInBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export async function recordDelivery(
  pedidoId: string,
  rawInput: unknown,
): Promise<ActionResult<{ deliveryId: string; units: number }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof pedidoId !== "string" || !/^[0-9a-f-]{36}$/i.test(pedidoId))
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  const { allowed } = await checkRateLimit(rateLimits.general, guard.user.id);
  if (!allowed)
    return {
      success: false,
      error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta en un minuto." },
    };
  const parsed = recordDeliverySchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const today = todayInBogota();
  if (input.deliveredOn && input.deliveredOn > today)
    return fieldError("deliveredOn", "La fecha de entrega no puede ser futura.");
  const actor = actorOf(guard.user);

  try {
    const result = await getTxDb().transaction(async (tx) => {
      const [pedido] = await tx
        .select({
          number: pedidos.number,
          destination: pedidos.destination,
          cancelledAt: pedidos.cancelledAt,
        })
        .from(pedidos)
        .where(eq(pedidos.id, pedidoId))
        .for("update");
      if (!pedido) throw new ConflictError("NOT_FOUND", "Pedido no encontrado");

      // A retried submit returns the delivery it already recorded.
      const [already] = await tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(eq(deliveries.idempotencyKey, input.idempotencyKey));
      if (already) {
        const [{ units }] = await tx
          .select({ units: sql<number>`coalesce(sum(${deliveryCells.quantity}), 0)::int` })
          .from(deliveryCells)
          .where(eq(deliveryCells.deliveryId, already.id));
        return { deliveryId: already.id, units: Number(units) };
      }

      if (pedido.cancelledAt) throw new ConflictError("CONFLICT", "El pedido está cancelado.");
      if (pedido.destination === "inventory")
        throw new ConflictError(
          "CONFLICT",
          "Los pedidos para inventario no se entregan: sus unidades entran al inventario.",
        );

      const existing = await loadExistingLines(tx, pedidoId);
      const cellsById = new Map(
        existing.flatMap((l) =>
          l.kind === "garment" ? l.cells.map((c) => [c.id, c] as const) : [],
        ),
      );
      const toDeliver = input.cells.filter((c) => c.quantity > 0);
      for (const c of toDeliver) {
        const cell = cellsById.get(c.cellId);
        if (!cell) throw new InputError("cells", "Una talla no pertenece a este pedido. Recarga.");
        const ready = cell.approved - cell.delivered;
        if (c.quantity > ready)
          throw new InputError(
            "cells",
            ready > 0
              ? `La talla ${cell.label} solo tiene ${ready} ${ready === 1 ? "unidad lista" : "unidades listas"} para entregar.`
              : `La talla ${cell.label} no tiene unidades aprobadas sin entregar.`,
          );
      }

      const deliveredAt =
        !input.deliveredOn || input.deliveredOn === today
          ? new Date()
          : new Date(`${input.deliveredOn}T12:00:00-05:00`);
      const [delivery] = await tx
        .insert(deliveries)
        .values({
          pedidoId,
          deliveredAt,
          deliveredBy: guard.employeeId,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: deliveries.id });
      await tx.insert(deliveryCells).values(
        toDeliver.map((c) => ({
          deliveryId: delivery.id,
          cellId: c.cellId,
          quantity: c.quantity,
        })),
      );

      const units = toDeliver.reduce((n, c) => n + c.quantity, 0);
      const number = formatPedidoNumber(pedido.number);
      await logActivity(tx, {
        actor,
        action: "pedido.deliver",
        entityType: "pedido",
        entityId: pedidoId,
        data: { units, number },
        after: {
          deliveredAt,
          note: input.note ?? null,
          cells: toDeliver.map((c) => ({
            size: cellsById.get(c.cellId)!.label,
            quantity: c.quantity,
          })),
        },
      });
      return { deliveryId: delivery.id, units };
    });

    revalidatePath("/pedidos");
    revalidatePath(`/pedidos/${pedidoId}`);
    financialBreadcrumb("recordDelivery", {
      pedidoId,
      deliveryId: result.deliveryId,
      units: result.units,
    });
    return { success: true, data: result };
  } catch (err) {
    const fail = toFail(err);
    if (fail) return fail;
    throw err;
  }
}

// ─── List and detail (T117) ──────────────────────────────────────────────────

const PEDIDO_STATUSES = [
  "pending",
  "in_production",
  "ready",
  "partially_delivered",
  "delivered",
  "paid",
  "cancelled",
] as const;

const listFilterSchema = z
  .object({
    destination: z.enum(["client", "inventory"]).optional().catch(undefined),
    status: z.enum(PEDIDO_STATUSES).optional().catch(undefined),
    large: z.boolean().optional().catch(undefined),
    overdue: z.boolean().optional().catch(undefined),
    q: z.string().max(100).optional().catch(undefined),
  })
  .catch({});

export async function listPedidos(
  rawFilter: unknown = {},
): Promise<ActionResult<PedidoListItem[]>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  const filter = listFilterSchema.parse(rawFilter);
  return { success: true, data: await listPedidoOverviews(getDb(), filter) };
}

export type PedidoViewer = {
  /** admin + cashier: clothier piece rates are visible */
  canSeeRates: boolean;
  isAdmin: boolean;
  /** admin + cashier, or the secretary when the setting allows it (T127) */
  canRecordPayments: boolean;
  /** A business day is open: payments now belong to it, otherwise after hours */
  dayOpen: boolean;
};

export async function getPedido(
  id: string,
): Promise<ActionResult<PedidoDetail & { viewer: PedidoViewer }>> {
  const guard = await requirePedidoRole();
  if ("success" in guard) return guard;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  const detail = await getPedidoDetail(getDb(), id);
  if (!detail)
    return { success: false, error: { code: "NOT_FOUND", message: "Pedido no encontrado" } };
  // Piece rates are clothier pay: never sent to the secretary.
  const canSeeRates = guard.canEditPrices;
  const lines = canSeeRates
    ? detail.lines
    : detail.lines.map((l) =>
        l.kind === "garment"
          ? {
              ...l,
              variantPieceRate: null,
              assignments: l.assignments.map((a) => ({ ...a, pieceRate: null, rateReason: null })),
            }
          : l,
      );
  const [settings, openDay] = await Promise.all([
    getBusinessSettings(),
    getDb().execute(sql`SELECT 1 FROM business_days WHERE closed_at IS NULL LIMIT 1`),
  ]);
  const canRecordPayments = canSeeRates || settings.secretaryCanRecordPedidoPayments;
  return {
    success: true,
    data: {
      ...detail,
      lines,
      viewer: {
        canSeeRates,
        isAdmin: hasRole(guard.user, "admin"),
        canRecordPayments,
        dayOpen: openDay.rows.length > 0,
      },
    },
  };
}
