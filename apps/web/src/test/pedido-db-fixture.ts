/**
 * Shared fixture for server-action tests that run against the throwaway
 * Postgres (scripts/test-db.sh). Callers mock auth/headers/rate-limit and
 * point DATABASE_URL at TEST_DATABASE_URL before importing this.
 */

import { sql } from "drizzle-orm";
import * as s from "@befine/db/schema";
import { getDb } from "@/lib/db";

const tag = () => Math.random().toString(36).slice(2, 8);

export const hasTestDb =
  Boolean(process.env.TEST_DATABASE_URL) &&
  (process.env.NEON_LOCAL_PROXY === "1" || process.env.TEST_DATABASE_NEON === "1");

export type PedidoFixture = Awaited<ReturnType<typeof makeFixture>>;

export async function makeFixture() {
  const db = getDb();
  const mkEmployee = async (role: string) => {
    const id = `u-${role}-${tag()}`;
    await db.insert(s.users).values({
      id,
      name: role === "clothier" ? "Luz" : "Admin",
      email: `${id}@test.local`,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [emp] = await db.insert(s.employees).values({ userId: id, role }).returning();
    return { userId: id, employeeId: emp!.id };
  };
  const admin = await mkEmployee("admin");
  const clothier = await mkEmployee("clothier");
  // Reuse the open day if one exists (only one may be open).
  const [open] = await db
    .select({ id: s.businessDays.id })
    .from(s.businessDays)
    .where(sql`${s.businessDays.closedAt} IS NULL`)
    .limit(1);
  const dayId =
    open?.id ??
    (await db.insert(s.businessDays).values({ openedBy: admin.userId }).returning())[0]!.id;
  const [piece] = await db
    .insert(s.clothPieces)
    .values({ name: `Bikini ${tag()}` })
    .returning();
  const [variant] = await db
    .insert(s.clothPieceVariants)
    .values({
      clothPieceId: piece!.id,
      name: "Dos piezas",
      pieceRate: 12_000,
      sellingPrice: 45_000,
    })
    .returning();
  const [sz] = await db
    .insert(s.garmentSizes)
    .values({ label: `S-${tag()}` })
    .returning();
  const [mz] = await db
    .insert(s.garmentSizes)
    .values({ label: `M-${tag()}` })
    .returning();
  const [rojo] = await db
    .insert(s.garmentColors)
    .values({ label: `Rojo ${tag()}` })
    .returning();
  const [azul] = await db
    .insert(s.garmentColors)
    .values({ label: `Azul ${tag()}` })
    .returning();
  const [client] = await db
    .insert(s.clients)
    .values({ name: "Ana Pérez", phone: "3001234567" })
    .returning();
  return {
    admin,
    clothier,
    dayId,
    variantId: variant!.id,
    S: sz!.id,
    M: mz!.id,
    rojo: rojo!.id,
    azul: azul!.id,
    clientId: client!.id,
  };
}
