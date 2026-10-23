/**
 * M-70b — integration-test harness for packages/db/src/queries.
 *
 * Runs against the throwaway Postgres from apps/web/e2e/db/compose.yaml (or the
 * CI service containers): set TEST_DATABASE_URL and NEON_LOCAL_PROXY=1. Without
 * them the suites are skipped, so `turbo test` still works with no database.
 *
 * Every test runs inside one transaction that first TRUNCATEs the app tables
 * (an empty slate, whatever E2E or other runs left behind) and is always
 * rolled back — nothing is ever committed. Files run one at a time
 * (vitest.config.ts) because TRUNCATE takes table locks.
 */

import { describe } from "vitest";
import { sql } from "drizzle-orm";
import { createTxDb, type Database } from "../../../index";
import * as s from "../../../schema";

const url = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(url) && process.env.NEON_LOCAL_PROXY === "1";

/** Skips the suite unless a test database is configured. */
export const describeDb: ReturnType<typeof describe.skipIf> = describe.skipIf(!hasTestDb);

const ROLLBACK = new Error("rollback");
let txDb: ReturnType<typeof createTxDb> | null = null;

/** Tables kept across the truncate: migrations bookkeeping and the settings singleton. */
const KEEP = new Set(["__drizzle_migrations", "business_settings"]);

export async function withCleanDb(fn: (db: Database) => Promise<void>): Promise<void> {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  txDb ??= createTxDb(url);
  try {
    await txDb.transaction(async (tx) => {
      const tables = await tx.execute<{ tablename: string }>(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      );
      const names = tables.rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
      if (names.length > 0)
        await tx.execute(sql.raw(`TRUNCATE ${names.map((n) => `"${n}"`).join(", ")} CASCADE`));
      // The WS transaction has the same query API as the HTTP Database.
      await fn(tx as unknown as Database);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
const next = () => `${Date.now().toString(36)}-${++seq}`;

export async function makeUser(db: Database, name = "Admin"): Promise<string> {
  const id = `u-${next()}`;
  await db.insert(s.users).values({
    id,
    name,
    email: `${id}@test.local`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

export async function makeEmployee(
  db: Database,
  opts: {
    name?: string;
    role?: "stylist" | "clothier" | "secretary" | "cashier" | "admin";
    subtype?: "hairdresser" | "manicurist" | "spa_manager" | "masseuse" | "makeup_artist";
    dailyRate?: number;
    expectedWorkDays?: number;
    isActive?: boolean;
  } = {},
): Promise<{ id: string; userId: string }> {
  const role = opts.role ?? "stylist";
  const userId = await makeUser(db, opts.name ?? role);
  const [emp] = await db
    .insert(s.employees)
    .values({
      userId,
      role,
      stylistSubtype: role === "stylist" ? (opts.subtype ?? "hairdresser") : null,
      dailyRate: opts.dailyRate ?? null,
      expectedWorkDays: opts.expectedWorkDays ?? 6,
      isActive: opts.isActive ?? true,
    })
    .returning({ id: s.employees.id });
  return { id: emp!.id, userId };
}

/** A business day; closed unless `open: true` (only one may be open). */
export async function makeDay(
  db: Database,
  openedAt: string,
  opts: { open?: boolean; openedBy?: string } = {},
): Promise<string> {
  const openedBy = opts.openedBy ?? (await makeUser(db));
  const opened = new Date(openedAt);
  const [day] = await db
    .insert(s.businessDays)
    .values({
      openedAt: opened,
      openedBy,
      closedAt: opts.open ? null : new Date(opened.getTime() + 10 * 60 * 60 * 1000),
      closedBy: opts.open ? null : openedBy,
    })
    .returning({ id: s.businessDays.id });
  return day!.id;
}

export async function makeVariant(
  db: Database,
  opts: { service?: string; variant?: string; price?: number; commissionPct?: string } = {},
): Promise<string> {
  const [service] = await db
    .insert(s.services)
    .values({ name: opts.service ?? `Servicio ${next()}` })
    .returning({ id: s.services.id });
  const [variant] = await db
    .insert(s.serviceVariants)
    .values({
      serviceId: service!.id,
      name: opts.variant ?? "Estándar",
      customerPrice: opts.price ?? 50_000,
      commissionPct: opts.commissionPct ?? "40.00",
    })
    .returning({ id: s.serviceVariants.id });
  return variant!.id;
}

/** A ticket with one item; `closed` by default. */
export async function makeTicket(
  db: Database,
  opts: {
    dayId: string;
    employeeId: string;
    variantId: string;
    status?: "logged" | "awaiting_payment" | "closed" | "reopened" | "paid_offline" | "voided";
    quantity?: number;
    unitPrice?: number;
    overridePrice?: number | null;
    commissionPct?: string;
    needsReview?: boolean;
  },
): Promise<{ ticketId: string; itemId: string }> {
  const [ticket] = await db
    .insert(s.tickets)
    .values({
      businessDayId: opts.dayId,
      employeeId: opts.employeeId,
      createdBy: opts.employeeId,
      guestName: `Cliente ${next()}`,
      status: opts.status ?? "closed",
      needsReview: opts.needsReview ?? false,
    })
    .returning({ id: s.tickets.id });
  const [item] = await db
    .insert(s.ticketItems)
    .values({
      ticketId: ticket!.id,
      serviceVariantId: opts.variantId,
      quantity: opts.quantity ?? 1,
      unitPrice: opts.unitPrice ?? 50_000,
      overridePrice: opts.overridePrice ?? null,
      overrideReason: opts.overridePrice != null ? "Ajuste de prueba" : null,
      commissionPct: opts.commissionPct ?? "40.00",
    })
    .returning({ id: s.ticketItems.id });
  return { ticketId: ticket!.id, itemId: item!.id };
}

/** A payout covering `dayIds` for the employee (payout_period_days). */
export async function makePayout(
  db: Database,
  opts: { employeeId: string; recordedBy: string; dayIds: string[]; amount?: number },
): Promise<string> {
  const [payout] = await db
    .insert(s.payouts)
    .values({
      idempotencyKey: crypto.randomUUID(),
      employeeId: opts.employeeId,
      amount: opts.amount ?? 0,
      originalComputedAmount: opts.amount ?? 0,
      method: "cash",
      recordedBy: opts.recordedBy,
    })
    .returning({ id: s.payouts.id });
  if (opts.dayIds.length > 0)
    await db.insert(s.payoutPeriodDays).values(
      opts.dayIds.map((businessDayId) => ({
        payoutId: payout!.id,
        employeeId: opts.employeeId,
        businessDayId,
      })),
    );
  return payout!.id;
}

/** A cloth piece with one variant at `pieceRate` (and optional selling price). */
export async function makeClothVariant(
  db: Database,
  opts: { name?: string; pieceRate?: number; sellingPrice?: number | null } = {},
): Promise<{ pieceId: string; variantId: string }> {
  const [piece] = await db
    .insert(s.clothPieces)
    .values({ name: opts.name ?? `Prenda ${next()}` })
    .returning({ id: s.clothPieces.id });
  const [variant] = await db
    .insert(s.clothPieceVariants)
    .values({
      clothPieceId: piece!.id,
      name: "Estándar",
      pieceRate: opts.pieceRate ?? 8_000,
      sellingPrice: opts.sellingPrice ?? null,
    })
    .returning({ id: s.clothPieceVariants.id });
  return { pieceId: piece!.id, variantId: variant!.id };
}

/** A product (craftable) on a day with the given pieces. */
export async function makeProduct(
  db: Database,
  opts: {
    dayId: string;
    createdBy: string;
    largeOrderId?: string;
    source?: "manual" | "large_order";
    autoApproved?: boolean;
    pieces: {
      cloth: { pieceId: string; variantId: string };
      assignedTo?: string | null;
      status?: "pending" | "done_pending_approval" | "approved";
      quantity?: number;
      soldPrice?: number;
    }[];
  },
): Promise<{ productId: string; pieceIds: string[] }> {
  const [product] = await db
    .insert(s.products)
    .values({
      businessDayId: opts.dayId,
      createdBy: opts.createdBy,
      largeOrderId: opts.largeOrderId ?? null,
      source: opts.source ?? "manual",
      autoApproved: opts.autoApproved ?? false,
    })
    .returning({ id: s.products.id });
  const pieceIds: string[] = [];
  for (const p of opts.pieces) {
    const [row] = await db
      .insert(s.productPieces)
      .values({
        productId: product!.id,
        clothPieceId: p.cloth.pieceId,
        clothPieceVariantId: p.cloth.variantId,
        assignedToEmployeeId: p.assignedTo ?? null,
        status: p.status ?? "pending",
        quantity: p.quantity ?? 1,
        soldAt: p.soldPrice !== undefined ? new Date() : null,
        soldPrice: p.soldPrice ?? null,
      })
      .returning({ id: s.productPieces.id });
    pieceIds.push(row!.id);
  }
  return { productId: product!.id, pieceIds };
}

export async function makeClothSale(
  db: Database,
  opts: {
    dayId: string;
    soldBy: string;
    cloth: { pieceId: string; variantId: string };
    unitPrice: number;
    quantity?: number;
    priceOverride?: number | null;
  },
): Promise<void> {
  await db.insert(s.clothSales).values({
    businessDayId: opts.dayId,
    clothPieceId: opts.cloth.pieceId,
    clothPieceVariantId: opts.cloth.variantId,
    quantity: opts.quantity ?? 1,
    unitPrice: opts.unitPrice,
    priceOverride: opts.priceOverride ?? null,
    soldBy: opts.soldBy,
    paymentMethod: "cash",
  });
}

export async function makeAbsence(
  db: Database,
  opts: {
    employeeId: string;
    createdBy: string;
    date: string;
    type: "vacation" | "approved_absence" | "missed";
  },
): Promise<void> {
  await db.insert(s.employeeAbsences).values(opts);
}

/** A large order for a new client, with order items. */
export async function makeLargeOrder(
  db: Database,
  opts: {
    createdBy: string;
    clientName?: string;
    items: { cloth: { pieceId: string; variantId: string }; quantity: number; name?: string }[];
  },
): Promise<{ orderId: string; itemIds: string[] }> {
  const [client] = await db
    .insert(s.clients)
    .values({ name: opts.clientName ?? `Cliente ${next()}` })
    .returning({ id: s.clients.id });
  const [order] = await db
    .insert(s.largeOrders)
    .values({
      clientId: client!.id,
      description: "Pedido de prueba",
      totalPrice: 1_000_000,
      createdBy: opts.createdBy,
    })
    .returning({ id: s.largeOrders.id });
  const itemIds: string[] = [];
  for (const it of opts.items) {
    const [row] = await db
      .insert(s.orderItems)
      .values({
        largeOrderId: order!.id,
        clothPieceId: it.cloth.pieceId,
        clothPieceVariantId: it.cloth.variantId,
        pieceName: it.name ?? "Bata",
        quantity: it.quantity,
      })
      .returning({ id: s.orderItems.id });
    itemIds.push(row!.id);
  }
  return { orderId: order!.id, itemIds };
}

export async function makeAssignment(
  db: Database,
  opts: {
    orderItemId: string;
    productPieceId: string;
    assigneeId: string;
    assigned: number;
    completed?: number;
    approved?: number;
  },
): Promise<string> {
  const [row] = await db
    .insert(s.clothPieceAssignments)
    .values({
      orderItemId: opts.orderItemId,
      productPieceId: opts.productPieceId,
      assigneeId: opts.assigneeId,
      assignedQuantity: opts.assigned,
      completedQuantity: opts.completed ?? 0,
      approvedQuantity: opts.approved ?? 0,
    })
    .returning({ id: s.clothPieceAssignments.id });
  return row!.id;
}
