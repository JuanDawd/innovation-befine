// @vitest-environment node
/**
 * Realistic demo data for a test or preview database — T135.
 *
 * Drives the real server actions with a mocked session, so every row goes
 * through the same validation, rules and activity log as the app: a salon and
 * garment workshop in Bogotá with Colombian clients, real services and
 * garments, pedidos in every state, production, payments, stock, garment
 * sales and service tickets on today's business day.
 *
 * Refuses unless DEMO_SEED_CONFIRM=1, and refuses a database that already has
 * pedidos (run the reset first). Needs the 8 seed users (src/seed.ts).
 *
 *   pnpm --filter @befine/db db:reset-test-data …   (optional, see reset-test-data.ts)
 *   DEMO_DATABASE_URL=… DEMO_SEED_CONFIRM=1 pnpm --filter web demo:seed
 *
 * Never point it at production.
 */
import { describe, it, expect, vi } from "vitest";
import { eq, sql, asc } from "drizzle-orm";

vi.setConfig({ testTimeout: 600_000 });
if (process.env.DEMO_DATABASE_URL) process.env.DATABASE_URL = process.env.DEMO_DATABASE_URL;

const session = vi.hoisted(() => ({ user: { id: "", role: "admin" } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: () => {}, captureException: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimits: new Proxy({}, { get: () => "x" }),
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@befine/realtime/server", () => ({ publishEvent: async () => {} }));
vi.mock("@/lib/business-day", async () => {
  const { getDb } = await import("@/lib/db");
  const s = await import("@befine/db/schema");
  const { isNull } = await import("drizzle-orm");
  return {
    getCurrentBusinessDay: async () =>
      (
        await getDb().select().from(s.businessDays).where(isNull(s.businessDays.closedAt)).limit(1)
      )[0] ?? null,
    getLastClosedBusinessDay: async () => null,
  };
});

import * as s from "@befine/db/schema";
import { getDb } from "@/lib/db";
import { openBusinessDay } from "@/app/(protected)/cashier/actions/business-day";
import {
  createPedido,
  cancelPedido,
  getPedidoForEdit,
  recordDelivery,
} from "@/app/(protected)/pedidos/actions";
import { assignUnits } from "@/app/(protected)/pedidos/production-actions";
import { recordPedidoPayment } from "@/app/(protected)/pedidos/payment-actions";
import { reportUnits, submitMyClosing } from "@/app/(protected)/clothier/work-actions";
import { reviewUnits, approveClosing } from "@/app/(protected)/produccion/actions";
import { adjustStock } from "@/app/(protected)/inventario/actions";
import { createClothSale } from "@/app/(protected)/cashier/actions/cloth-sales";
import { createTicket, transitionToAwaitingPayment } from "@/app/(protected)/tickets/actions";
import { processCheckout } from "@/app/(protected)/cashier/checkout/actions";

const key = () => crypto.randomUUID();
const ok = <T>(
  r: { success: true; data: T } | { success: false; error: { message: string } },
  what: string,
): T => {
  if (!r.success) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const bogota = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
};

describe.skipIf(!process.env.DEMO_DATABASE_URL || process.env.DEMO_SEED_CONFIRM !== "1")(
  "demo seed",
  () => {
    it("fills the dev database", async () => {
      const db = getDb();
      const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM pedidos`)).rows as {
        n: number;
      }[];
      if (n > 0) throw new Error("Refusing: this database already has pedidos");

      // ── People ─────────────────────────────────────────────────────────────
      const userByEmail = async (email: string) => {
        const [u] = await db
          .select({ id: s.users.id })
          .from(s.users)
          .where(eq(s.users.email, email));
        const [e] = await db
          .select({ id: s.employees.id })
          .from(s.employees)
          .where(eq(s.employees.userId, u!.id));
        return { userId: u!.id, employeeId: e!.id };
      };
      const admin = await userByEmail("admin@befine.dev");
      const secretary = await userByEmail("secretary@befine.dev");
      const luz = await userByEmail("clothier@befine.dev");
      const stylists = await Promise.all(
        ["hairdresser", "manicurist", "masseuse", "makeup", "spa"].map((n) =>
          userByEmail(`${n}@befine.dev`),
        ),
      );
      // Two more clothiers (no login) so assignments spread across a team.
      const mkClothier = async (name: string) => {
        const id = `demo-${name.toLowerCase().replace(/\W+/g, "-")}`;
        await db
          .insert(s.users)
          .values({
            id,
            name,
            email: `${id}@befine.dev`,
            role: "clothier",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
        const [had] = await db
          .select({ id: s.employees.id })
          .from(s.employees)
          .where(eq(s.employees.userId, id));
        const e =
          had ??
          (
            await db
              .insert(s.employees)
              .values({ userId: id, role: "clothier", showEarnings: true })
              .returning()
          )[0];
        return { userId: id, employeeId: e!.id };
      };
      const rosa = await mkClothier("Rosa Pérez");
      const marleny = await mkClothier("Marleny Gómez");
      const as = (u: { userId: string }, role: string) => (session.user = { id: u.userId, role });

      // ── Catalog ────────────────────────────────────────────────────────────
      await db
        .insert(s.garmentSizes)
        .values(["XS", "S", "M", "L", "XL"].map((label, i) => ({ label, sortOrder: i })))
        .onConflictDoNothing();
      const sizes = await db.select().from(s.garmentSizes);
      const size = Object.fromEntries(sizes.map((z) => [z.label.toUpperCase(), z.id]));
      await db
        .insert(s.garmentColors)
        .values([
          { label: "Blanco", hex: "#FFFFFF" },
          { label: "Negro", hex: "#1A1A1A" },
          { label: "Rosa palo", hex: "#E8B4B8" },
          { label: "Azul marino", hex: "#1F2A44" },
          { label: "Beige", hex: "#D8C3A5" },
        ])
        .onConflictDoNothing();
      const colors = await db.select().from(s.garmentColors);
      const color = Object.fromEntries(colors.map((c) => [c.label, c.id]));
      console.log(
        "sizes:",
        sizes.map((z) => z.label).join(","),
        "| colors:",
        colors.map((c) => c.label).join(","),
      );

      const garment = async (name: string, variants: [string, number, number][]) => {
        const [had] = await db.select().from(s.clothPieces).where(eq(s.clothPieces.name, name));
        if (had) {
          const rows = await db
            .select()
            .from(s.clothPieceVariants)
            .where(eq(s.clothPieceVariants.clothPieceId, had.id));
          return Object.fromEntries(rows.map((r) => [r.name, r.id]));
        }
        const [p] = await db.insert(s.clothPieces).values({ name }).returning();
        const rows = await db
          .insert(s.clothPieceVariants)
          .values(
            variants.map(([v, pieceRate, sellingPrice]) => ({
              clothPieceId: p!.id,
              name: v,
              pieceRate,
              sellingPrice,
            })),
          )
          .returning();
        return Object.fromEntries(rows.map((r) => [r.name, r.id]));
      };
      const bata = await garment("Bata de baño", [
        ["Toalla", 18_000, 85_000],
        ["Satín", 15_000, 70_000],
      ]);
      const pijama = await garment("Pijama", [
        ["Short", 10_000, 55_000],
        ["Pantalón largo", 14_000, 75_000],
      ]);
      const kimono = await garment("Kimono", [["Corto", 12_000, 65_000]]);
      const uniforme = await garment("Uniforme spa", [["Antifluido", 16_000, 90_000]]);

      const service = async (name: string, variants: [string, number, string][]) => {
        const [had] = await db.select().from(s.services).where(eq(s.services.name, name));
        if (had) {
          const rows = await db
            .select()
            .from(s.serviceVariants)
            .where(eq(s.serviceVariants.serviceId, had.id));
          return Object.fromEntries(rows.map((r) => [r.name, r.id]));
        }
        const [sv] = await db.insert(s.services).values({ name }).returning();
        const rows = await db
          .insert(s.serviceVariants)
          .values(
            variants.map(([v, customerPrice, commissionPct]) => ({
              serviceId: sv!.id,
              name: v,
              customerPrice,
              commissionPct,
            })),
          )
          .returning();
        return Object.fromEntries(rows.map((r) => [r.name, r.id]));
      };
      const corte = await service("Corte de cabello", [
        ["Dama", 45_000, "40.00"],
        ["Caballero", 25_000, "40.00"],
      ]);
      const mani = await service("Manicure", [
        ["Tradicional", 20_000, "50.00"],
        ["Semipermanente", 45_000, "50.00"],
      ]);
      const masaje = await service("Masaje", [["Relajante 60 min", 90_000, "35.00"]]);
      const maquillaje = await service("Maquillaje", [["Social", 80_000, "45.00"]]);

      const wanted: [string, string][] = [
        ["Ana María Restrepo", "3104567890"],
        ["Carolina Gómez", "3157891234"],
        ["Hotel Casa Andina", "6017452200"],
        ["Spa Aguas Claras", "3009876543"],
        ["Valentina Ríos", "3201122334"],
        ["Paula Andrea Mejía", "3123344556"],
        ["Daniela Castro", "3165566778"],
        ["Clínica Estética Lumière", "6013338899"],
        ["Laura Sánchez", "3019988776"],
        ["Mariana Ospina", "3186655443"],
      ];
      for (const [name, phone] of wanted) {
        const [had] = await db
          .select({ id: s.clients.id })
          .from(s.clients)
          .where(eq(s.clients.name, name));
        if (!had) await db.insert(s.clients).values({ name, phone });
      }
      const clientRows = await db.select().from(s.clients);
      const client = Object.fromEntries(clientRows.map((c) => [c.name, c.id]));

      // ── Today's business day ───────────────────────────────────────────────
      as(admin, "admin");
      const [openDay] = (
        await db.execute(sql`SELECT id FROM business_days WHERE closed_at IS NULL`)
      ).rows;
      if (!openDay) ok(await openBusinessDay(), "open day");

      // ── Pedidos ────────────────────────────────────────────────────────────
      type Line = {
        variant: string;
        color?: string;
        price: number;
        cells: [string, number][];
        style?: string;
      };
      const catalogPrice = new Map(
        (
          await db
            .select({ id: s.clothPieceVariants.id, price: s.clothPieceVariants.sellingPrice })
            .from(s.clothPieceVariants)
        ).map((v) => [v.id, v.price]),
      );
      const pedido = async (p: {
        client?: string;
        delivery?: number;
        notes?: string;
        lines: Line[];
      }) => {
        as(admin, "admin");
        const r = ok(
          await createPedido({
            destination: p.client ? "client" : "inventory",
            clientId: p.client ? client[p.client] : undefined,
            estimatedDeliveryDate: p.delivery !== undefined ? bogota(p.delivery) : undefined,
            notes: p.notes,
            lines: p.lines.map((l) => ({
              kind: "garment" as const,
              clothPieceVariantId: l.variant,
              colorId: l.color ? color[l.color] : undefined,
              style: l.style,
              unitPrice: l.price,
              priceReason:
                catalogPrice.get(l.variant) !== l.price ? "Precio acordado por volumen" : undefined,
              cells: l.cells.map(([sz, quantity]) => ({ sizeId: size[sz], quantity })),
            })),
          }),
          "pedido",
        );
        const cells = await db
          .select({
            id: s.pedidoLineCells.id,
            quantity: s.pedidoLineCells.quantity,
            lineId: s.pedidoLineCells.lineId,
          })
          .from(s.pedidoLineCells)
          .innerJoin(s.pedidoLines, eq(s.pedidoLines.id, s.pedidoLineCells.lineId))
          .where(eq(s.pedidoLines.pedidoId, r.id))
          .orderBy(asc(s.pedidoLines.position), asc(s.pedidoLineCells.createdAt));
        return { id: r.id, cells };
      };
      const assign = async (
        cell: { id: string; quantity: number },
        who: { employeeId: string },
        quantity: number,
        expectedUnassigned = cell.quantity,
      ) => {
        as(secretary, "secretary");
        return ok(
          await assignUnits({
            cellId: cell.id,
            employeeId: who.employeeId,
            quantity,
            expectedUnassigned,
          }),
          "assign",
        ).assignmentId as string;
      };
      const report = async (who: { userId: string }, assignmentId: string, quantity: number) => {
        as(who, "clothier");
        ok(await reportUnits({ assignmentId, quantity, idempotencyKey: key() }), "report");
      };
      const review = async (
        assignmentId: string,
        pending: number,
        approved: number,
        returned = 0,
        scrapped = 0,
      ) => {
        as(secretary, "secretary");
        ok(
          await reviewUnits(assignmentId, {
            expectedPending: pending,
            approved,
            returned,
            returnCode: returned ? "costura" : undefined,
            scrapped,
            scrapCode: scrapped ? "mancha" : undefined,
            idempotencyKey: key(),
          }),
          "review",
        );
      };
      const pay = async (
        id: string,
        amount: number,
        method: "cash" | "card" | "transfer" = "transfer",
        kind: "payment" | "refund" = "payment",
        note?: string,
      ) => {
        as(admin, "admin");
        ok(
          await recordPedidoPayment(id, { kind, amount, method, note, idempotencyKey: key() }),
          "payment",
        );
      };
      const deliver = async (
        id: string,
        cells: { cellId: string; quantity: number }[],
        note?: string,
      ) => {
        as(admin, "admin");
        ok(await recordDelivery(id, { idempotencyKey: key(), cells, note }), "delivery");
      };

      // 1. Hotel: 20 batas, half paid, nothing assigned yet.
      const p1 = await pedido({
        client: "Hotel Casa Andina",
        delivery: 21,
        notes: "Bordar logo del hotel en el bolsillo",
        lines: [
          {
            variant: bata.Toalla!,
            color: "Blanco",
            price: 80_000,
            cells: [
              ["M", 8],
              ["L", 8],
              ["XL", 4],
            ],
            style: "Con capucha",
          },
        ],
      });
      await pay(p1.id, 800_000, "transfer");

      // 2. Spa: uniforms in production — some reported, waiting for review.
      const p2 = await pedido({
        client: "Spa Aguas Claras",
        delivery: 7,
        lines: [
          {
            variant: uniforme.Antifluido!,
            color: "Azul marino",
            price: 88_000,
            cells: [
              ["S", 4],
              ["M", 6],
              ["L", 2],
            ],
          },
        ],
      });
      await pay(p2.id, 500_000, "cash");
      const a2a = await assign(p2.cells[0]!, luz, 4);
      const a2b = await assign(p2.cells[1]!, rosa, 6);
      await assign(p2.cells[2]!, marleny, 2);
      await report(luz, a2a, 4);
      await report(rosa, a2b, 3);
      await review(a2a, 4, 3, 1); // one returned for a seam

      // 3. Clinic: kimonos, all approved, partly delivered.
      const p3 = await pedido({
        client: "Clínica Estética Lumière",
        delivery: 2,
        lines: [
          {
            variant: kimono.Corto!,
            color: "Rosa palo",
            price: 62_000,
            cells: [
              ["S", 5],
              ["M", 5],
            ],
          },
        ],
      });
      await pay(p3.id, 620_000, "card");
      for (const [cell, who] of [
        [p3.cells[0]!, marleny],
        [p3.cells[1]!, rosa],
      ] as const) {
        const a = await assign(cell, who, 5);
        await report(who, a, 5);
        await review(a, 5, 5);
      }
      await deliver(
        p3.id,
        [{ cellId: p3.cells[0]!.id, quantity: 5 }],
        "Entregadas las talla S; M pendientes",
      );

      // 4. Valentina: pijamas, finished, delivered and paid in full.
      const p4 = await pedido({
        client: "Valentina Ríos",
        delivery: -1,
        lines: [
          {
            variant: pijama.Short!,
            color: "Rosa palo",
            price: 55_000,
            cells: [
              ["S", 2],
              ["M", 1],
            ],
          },
        ],
      });
      const a4a = await assign(p4.cells[0]!, luz, 2);
      const a4b = await assign(p4.cells[1]!, luz, 1);
      await report(luz, a4a, 2);
      await report(luz, a4b, 1);
      await review(a4a, 2, 2);
      await review(a4b, 1, 1);
      await pay(p4.id, 165_000, "cash");
      await deliver(
        p4.id,
        p4.cells.map((c) => ({ cellId: c.id, quantity: c.quantity })),
      );

      // 5. Overdue: promised 3 days ago, still not finished, small balance.
      const p5 = await pedido({
        client: "Carolina Gómez",
        delivery: -3,
        notes: "Cliente llamó preguntando por la entrega",
        lines: [
          { variant: bata["Satín"]!, color: "Negro", price: 70_000, cells: [["M", 2]] },
          { variant: pijama["Pantalón largo"]!, color: "Beige", price: 75_000, cells: [["L", 1]] },
        ],
      });
      await pay(p5.id, 100_000, "transfer");
      const a5 = await assign(p5.cells[0]!, rosa, 2);
      await report(rosa, a5, 2);

      // 6. Cancelled with a refund.
      const p6 = await pedido({
        client: "Laura Sánchez",
        delivery: 10,
        lines: [{ variant: kimono.Corto!, color: "Negro", price: 65_000, cells: [["M", 2]] }],
      });
      await pay(p6.id, 50_000, "cash");
      as(admin, "admin");
      const v6 = ok(await getPedidoForEdit(p6.id), "edit").version;
      ok(
        await cancelPedido(p6.id, {
          version: v6,
          reason: "La clienta desistió",
          acknowledgePayments: true,
        }),
        "cancel",
      );
      await pay(p6.id, 50_000, "cash", "refund", "Pedido cancelado");

      // 7. New, nothing paid yet.
      await pedido({
        client: "Paula Andrea Mejía",
        delivery: 14,
        lines: [
          {
            variant: pijama.Short!,
            color: "Azul marino",
            price: 55_000,
            cells: [
              ["XS", 1],
              ["S", 1],
            ],
          },
        ],
      });

      // 8. Inventory pedido, approved → stock.
      const p8 = await pedido({
        lines: [
          {
            variant: pijama.Short!,
            color: "Blanco",
            price: 55_000,
            cells: [
              ["S", 4],
              ["M", 4],
            ],
          },
          {
            variant: bata.Toalla!,
            color: "Blanco",
            price: 85_000,
            cells: [
              ["M", 3],
              ["L", 3],
            ],
          },
        ],
      });
      for (const [i, cell] of p8.cells.entries()) {
        const who = [luz, rosa, marleny][i % 3]!;
        const a = await assign(cell, who, cell.quantity);
        await report(who, a, cell.quantity);
        await review(a, cell.quantity, cell.quantity);
      }

      // 9. Inventory pedido still in production.
      const p9 = await pedido({
        lines: [
          {
            variant: kimono.Corto!,
            color: "Beige",
            price: 65_000,
            cells: [
              ["S", 3],
              ["M", 3],
              ["L", 3],
            ],
          },
        ],
      });
      const a9 = await assign(p9.cells[1]!, marleny, 3);
      await report(marleny, a9, 2);

      // ── Stock: opening count, then a few sales ──────────────────────────────
      as(admin, "admin");
      for (const [variant, sz, c, q] of [
        [pijama["Pantalón largo"]!, "M", "Negro", 5],
        [pijama["Pantalón largo"]!, "L", "Negro", 3],
        [bata["Satín"]!, "S", "Rosa palo", 4],
        [uniforme.Antifluido!, "M", "Blanco", 2],
        [kimono.Corto!, "M", "Rosa palo", 1],
      ] as const)
        ok(
          await adjustStock({
            clothPieceVariantId: variant,
            sizeId: size[sz],
            colorId: color[c],
            quantity: q,
            reasonCode: "conteo",
            note: "Conteo inicial",
            idempotencyKey: key(),
          }),
          "stock",
        );
      for (const [variant, sz, c, q, method] of [
        [pijama.Short!, "S", "Blanco", 2, "cash"],
        [pijama["Pantalón largo"]!, "M", "Negro", 1, "card"],
        [bata.Toalla!, "M", "Blanco", 1, "transfer"],
      ] as const)
        ok(
          await createClothSale({
            clothPieceVariantId: variant,
            sizeId: size[sz],
            colorId: color[c],
            quantity: q,
            paymentMethod: method,
            idempotencyKey: key(),
          }),
          "sale",
        );

      // ── Service tickets ─────────────────────────────────────────────────────
      const ticket = async (
        stylist: { employeeId: string },
        variant: string,
        who: string,
        guest = false,
      ) => {
        as(secretary, "secretary");
        return ok(
          await createTicket({
            employeeId: stylist.employeeId,
            serviceVariantId: variant,
            quantity: 1,
            clientType: guest ? "guest" : "saved",
            clientId: guest ? undefined : client[who],
            guestName: guest ? who : undefined,
            idempotencyKey: key(),
          }),
          "ticket",
        ).id as string;
      };
      const [hair, manicurist, masseuse, makeup] = stylists as [
        typeof admin,
        typeof admin,
        typeof admin,
        typeof admin,
      ];
      const paid = [
        [await ticket(hair, corte.Dama!, "Ana María Restrepo"), 45_000, "cash"],
        [await ticket(manicurist, mani.Semipermanente!, "Daniela Castro"), 45_000, "card"],
        [await ticket(masseuse, masaje["Relajante 60 min"]!, "Mariana Ospina"), 90_000, "transfer"],
        [await ticket(hair, corte.Caballero!, "Andrés (invitado)", true), 25_000, "cash"],
      ] as const;
      for (const [id, amount, method] of paid) {
        as(admin, "admin");
        ok(await transitionToAwaitingPayment({ ticketId: id }), "ready");
        ok(
          await processCheckout({
            ticketIds: [id],
            payments: [{ method, amount }],
            idempotencyKey: key(),
          }),
          "checkout",
        );
      }
      const waiting = await ticket(makeup, maquillaje.Social!, "Valentina Ríos");
      as(admin, "admin");
      ok(await transitionToAwaitingPayment({ ticketId: waiting }), "ready");
      await ticket(manicurist, mani.Tradicional!, "Carolina Gómez"); // still in service

      // ── Clothier closings: Rosa approved, Luz waiting for approval ──────────
      const closingFor = async (who: { userId: string; employeeId: string }) => {
        const rows = (
          await db.execute(sql`
          SELECT a.id, coalesce(sum(r.quantity), 0)::int AS reported
          FROM assignments a LEFT JOIN unit_reports r ON r.assignment_id = a.id
          WHERE a.employee_id = ${who.employeeId} GROUP BY a.id`)
        ).rows as { id: string; reported: number }[];
        as(who, "clothier");
        return ok(
          await submitMyClosing({
            lines: rows.map((r) => ({ assignmentId: r.id, finished: r.reported })),
            idempotencyKey: key(),
          }),
          "closing",
        ).closingId as string;
      };
      const rosaClosing = await closingFor(rosa);
      as(secretary, "secretary");
      ok(await approveClosing(rosaClosing, { version: 1 }), "approve closing");
      await closingFor(luz);

      const counts = (
        await db.execute(sql`SELECT
        (SELECT count(*) FROM pedidos)::int pedidos, (SELECT count(*) FROM assignments)::int assignments,
        (SELECT count(*) FROM unit_reviews)::int reviews, (SELECT count(*) FROM pedido_payments)::int payments,
        (SELECT count(*) FROM stock_movements)::int stock, (SELECT count(*) FROM cloth_sales)::int sales,
        (SELECT count(*) FROM tickets)::int tickets, (SELECT count(*) FROM clients)::int clients,
        (SELECT count(*) FROM activity_log)::int activity`)
      ).rows[0];
      console.log("demo data:", JSON.stringify(counts));
      expect(counts).toBeTruthy();
    });
  },
);
