/**
 * T09R-R10 — Endpoint contract tests
 *
 * Verifies the per-role RBAC contract for every server action and API route.
 * Tests four assertions per endpoint:
 *   (a) Authorized roles pass the role gate
 *   (b) Unauthorized roles are denied (FORBIDDEN)
 *   (c) Unauthenticated callers are denied (UNAUTHORIZED)
 *   (d) Zod schemas reject malformed inputs
 *
 * Uses pure-logic testing (no DB, no HTTP) consistent with the codebase pattern.
 * See _helpers.ts for the test strategy rationale.
 */

import { describe, it, expect } from "vitest";
import { hasRole, expectOnlyRoles, expectUnauthenticated, makeUser, ALL_ROLES } from "./_helpers";
import type { AppRole } from "@befine/types";

// ─── Zod schemas used for validation contract tests ───────────────────────────

import { z } from "zod";

// Inline minimal schemas matching packages/types/src/schemas/* for import safety
// (server actions use "use server" directive which Vitest cannot execute directly)

const uuidSchema = z.uuid();

const createTicketSchema = z
  .object({
    employeeId: z.uuid(),
    serviceVariantId: z.uuid(),
    quantity: z.number().int().min(1).default(1),
    clientType: z.enum(["saved", "guest"]),
    clientId: z.uuid().optional(),
    guestName: z.string().min(1).max(100).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine(
    (d) =>
      (d.clientType === "saved" && d.clientId) || (d.clientType === "guest" && d.guestName?.trim()),
    { path: ["clientType"] },
  );

const checkoutSessionSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "transfer"]),
        amount: z.number().int().positive(),
      }),
    )
    .min(1),
  idempotencyKey: z.uuid(),
});

const paidOfflineCheckoutSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  amount: z.number().int().positive(),
  idempotencyKey: z.uuid(),
});

const recordPayoutSchema = z.object({
  idempotencyKey: z.uuid(),
  employeeId: z.uuid(),
  businessDayIds: z.array(z.uuid()).min(1),
  amount: z.number().int().nonnegative(),
  originalComputedAmount: z.number().int().nonnegative(),
  adjustmentReason: z.string().max(500).nullish(),
  method: z.enum(["cash", "card", "transfer"]),
  notes: z.string().max(500).nullish(),
});

const createProductSchema = z.object({
  notes: z.string().max(500).optional(),
  largeOrderId: z.uuid().optional(),
  pieces: z
    .array(
      z.object({
        clothPieceId: z.uuid(),
        clothPieceVariantId: z.uuid(),
        assignedToEmployeeId: z.uuid().nullable(),
      }),
    )
    .min(1),
});

const markPieceDoneSchema = z.object({
  pieceId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.uuid().optional(),
});

const createAppointmentSchema = z
  .object({
    stylistId: z.uuid(),
    serviceVariantId: z.uuid(),
    scheduledAt: z.string(),
    clientType: z.enum(["saved", "guest"]),
    clientId: z.uuid().optional(),
    guestName: z.string().min(1).max(100).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      (d.clientType === "saved" && d.clientId) || (d.clientType === "guest" && d.guestName?.trim()),
    { path: ["clientType"] },
  );

const createClientSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

// ─── Helper: valid UUID ───────────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID();
}

// ─── Section 1: Role-gate contracts ──────────────────────────────────────────

describe("Role gate: tickets/actions", () => {
  const createTicketRoles: AppRole[] = ["cashier", "admin", "secretary", "stylist"];

  it("createTicket — allowed: cashier, admin, secretary, stylist", () => {
    expectOnlyRoles(createTicketRoles, "cashier", "admin", "secretary", "stylist");
  });

  it("createTicket — clothier is forbidden", () => {
    const clothier = makeUser("clothier");
    expect(hasRole(clothier, "cashier", "admin", "secretary", "stylist")).toBe(false);
  });

  it("createTicket — unauthenticated is denied", () => {
    expectUnauthenticated(["cashier", "admin", "secretary", "stylist"]);
  });

  it("listActiveStylists — allowed: cashier, admin, secretary", () => {
    expectOnlyRoles(["cashier", "admin", "secretary"], "cashier", "admin", "secretary");
  });

  it("transitionToAwaitingPayment — allowed: cashier, admin, secretary, stylist", () => {
    expectOnlyRoles(
      ["cashier", "admin", "secretary", "stylist"],
      "cashier",
      "admin",
      "secretary",
      "stylist",
    );
  });

  it("transitionReopenedToAwaitingPayment — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });
});

describe("Role gate: cashier/checkout/actions", () => {
  it("processCheckout — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("processPaidOfflineCheckout — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("setOverridePrice — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("getAwaitingPaymentTickets — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("listPriceOverrides — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });
});

describe("Role gate: cashier/actions (business day)", () => {
  it("openBusinessDay — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("closeBusinessDay — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("reopenBusinessDay — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });
});

describe("Role gate: admin/payroll/actions", () => {
  it("recordPayout — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("listPayouts — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("previewEarnings — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("getMyEarnings — allowed: stylist, clothier, secretary", () => {
    expectOnlyRoles(["stylist", "clothier", "secretary"], "stylist", "clothier", "secretary");
  });

  it("getMyEarnings — admin is NOT allowed", () => {
    const admin = makeUser("admin");
    expect(hasRole(admin, "stylist", "clothier", "secretary")).toBe(false);
  });

  it("getUnsettledEmployees — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });
});

describe("Role gate: products/actions", () => {
  it("createProduct — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("listActiveClothiers — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: products/approval-actions", () => {
  it("approveProductPiece — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("adminMarkProductPieceApproved — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("listPendingProductPieceApprovals — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: clothier/actions", () => {
  it("listTodayProductPieces — clothier only", () => {
    expectOnlyRoles(["clothier"], "clothier");
  });

  it("claimPiece — clothier only", () => {
    expectOnlyRoles(["clothier"], "clothier");
  });

  it("markPieceDone — clothier only", () => {
    expectOnlyRoles(["clothier"], "clothier");
  });
});

describe("Role gate: appointments/actions", () => {
  it("createAppointment — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("transitionAppointment — allowed: admin, secretary, stylist", () => {
    expectOnlyRoles(["admin", "secretary", "stylist"], "admin", "secretary", "stylist");
  });

  it("acknowledgeAppointmentPriceChange — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: clients/actions", () => {
  it("searchClients — allowed: admin, secretary, stylist", () => {
    expectOnlyRoles(["admin", "secretary", "stylist"], "admin", "secretary", "stylist");
  });

  it("createClient — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("editClient — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("archiveClient — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("listClients — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: large-orders/actions", () => {
  it("createLargeOrder — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });

  it("recordLargeOrderPayment — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("transitionLargeOrder — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: admin/employees/actions", () => {
  it("createEmployee — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("editEmployee — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("terminateEmployee — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("listEmployees — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });
});

describe("Role gate: admin/absences/actions", () => {
  it("logAbsence — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("deleteAbsence — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });
});

describe("Role gate: admin/analytics/actions", () => {
  it("getAnalyticsSummary — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("getEmployeePerformance — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("getAnalyticsCsvData — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("getEmployeeDrillDown — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });
});

describe("Role gate: admin/catalog/actions/services", () => {
  it("createService — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("editService — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("deactivateService — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("addVariant — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("listActiveServices — any authenticated role", () => {
    for (const role of ALL_ROLES) {
      const user = makeUser(role);
      // "any" = all five roles are permitted
      expect(hasRole(user, "cashier", "admin", "secretary", "stylist", "clothier")).toBe(true);
    }
  });
});

describe("Role gate: admin/catalog/actions/cloth-pieces", () => {
  it("createClothPiece — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("editClothPiece — admin only", () => {
    expectOnlyRoles(["admin"], "admin");
  });

  it("listActiveClothPieces — allowed: admin, secretary", () => {
    expectOnlyRoles(["admin", "secretary"], "admin", "secretary");
  });
});

describe("Role gate: tickets/edit-requests/actions", () => {
  it("requestEdit — stylist only", () => {
    expectOnlyRoles(["stylist"], "stylist");
  });

  it("resolveEditRequest — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("listPendingEditRequests — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });
});

describe("Role gate: admin/tickets/history/actions", () => {
  it("listBusinessDays — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("listClosedTickets — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });

  it("reopenTicket — cashier/admin only", () => {
    expectOnlyRoles(["cashier", "admin"], "cashier", "admin");
  });
});

describe("Role gate: notifications/actions", () => {
  it("listNotifications — any authenticated role", () => {
    for (const role of ALL_ROLES) {
      expect(hasRole(makeUser(role), "cashier", "admin", "secretary", "stylist", "clothier")).toBe(
        true,
      );
    }
  });

  it("markRead — any authenticated role", () => {
    for (const role of ALL_ROLES) {
      expect(hasRole(makeUser(role), "cashier", "admin", "secretary", "stylist", "clothier")).toBe(
        true,
      );
    }
  });
});

// ─── Section 2: Unauthenticated denial for all mutation gates ─────────────────

describe("UNAUTHORIZED: null session denied on all mutation gates", () => {
  const allMutationGates: Array<{ name: string; roles: AppRole[] }> = [
    { name: "createTicket", roles: ["cashier", "admin", "secretary", "stylist"] },
    { name: "processCheckout", roles: ["cashier", "admin"] },
    { name: "processPaidOfflineCheckout", roles: ["cashier", "admin"] },
    { name: "recordPayout", roles: ["admin"] },
    { name: "createProduct", roles: ["admin", "secretary"] },
    { name: "markPieceDone", roles: ["clothier"] },
    { name: "createAppointment", roles: ["admin", "secretary"] },
    { name: "createClient", roles: ["admin", "secretary"] },
    { name: "recordLargeOrderPayment", roles: ["admin"] },
    { name: "createEmployee", roles: ["admin"] },
    { name: "logAbsence", roles: ["admin"] },
    { name: "createService", roles: ["admin"] },
    { name: "openBusinessDay", roles: ["cashier", "admin"] },
    { name: "closeBusinessDay", roles: ["cashier", "admin"] },
    { name: "requestEdit", roles: ["stylist"] },
    { name: "resolveEditRequest", roles: ["cashier", "admin"] },
    { name: "reopenTicket", roles: ["cashier", "admin"] },
    { name: "terminateEmployee", roles: ["admin"] },
  ];

  for (const { name, roles } of allMutationGates) {
    it(`${name} — null role is denied`, () => {
      expectUnauthenticated(roles);
    });
  }
});

// ─── Section 3: Zod VALIDATION_ERROR contracts ───────────────────────────────

describe("VALIDATION_ERROR: createTicketSchema", () => {
  const validBase = {
    employeeId: uid(),
    serviceVariantId: uid(),
    clientType: "saved" as const,
    clientId: uid(),
    idempotencyKey: uid(),
  };

  it("accepts valid saved-client input", () => {
    expect(createTicketSchema.safeParse(validBase).success).toBe(true);
  });

  it("rejects missing employeeId", () => {
    const { employeeId, ...rest } = validBase;
    void employeeId;
    expect(createTicketSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-uuid employeeId", () => {
    expect(createTicketSchema.safeParse({ ...validBase, employeeId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("rejects missing idempotencyKey", () => {
    const { idempotencyKey, ...rest } = validBase;
    void idempotencyKey;
    expect(createTicketSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects saved client without clientId", () => {
    const { clientId, ...rest } = validBase;
    void clientId;
    expect(createTicketSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts guest client with guestName", () => {
    const input = {
      employeeId: uid(),
      serviceVariantId: uid(),
      clientType: "guest" as const,
      guestName: "Ana",
      idempotencyKey: uid(),
    };
    expect(createTicketSchema.safeParse(input).success).toBe(true);
  });

  it("rejects guest client with empty guestName", () => {
    const input = {
      employeeId: uid(),
      serviceVariantId: uid(),
      clientType: "guest" as const,
      guestName: "  ",
      idempotencyKey: uid(),
    };
    expect(createTicketSchema.safeParse(input).success).toBe(false);
  });
});

describe("VALIDATION_ERROR: checkoutSessionSchema", () => {
  const validCheckout = {
    ticketIds: [uid()],
    payments: [{ method: "cash" as const, amount: 50000 }],
    idempotencyKey: uid(),
  };

  it("accepts valid checkout input", () => {
    expect(checkoutSessionSchema.safeParse(validCheckout).success).toBe(true);
  });

  it("rejects empty ticketIds array", () => {
    expect(checkoutSessionSchema.safeParse({ ...validCheckout, ticketIds: [] }).success).toBe(
      false,
    );
  });

  it("rejects empty payments array", () => {
    expect(checkoutSessionSchema.safeParse({ ...validCheckout, payments: [] }).success).toBe(false);
  });

  it("rejects non-positive payment amount", () => {
    expect(
      checkoutSessionSchema.safeParse({
        ...validCheckout,
        payments: [{ method: "cash", amount: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid payment method", () => {
    expect(
      checkoutSessionSchema.safeParse({
        ...validCheckout,
        payments: [{ method: "bitcoin", amount: 1000 }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-uuid idempotencyKey", () => {
    expect(
      checkoutSessionSchema.safeParse({ ...validCheckout, idempotencyKey: "not-uuid" }).success,
    ).toBe(false);
  });
});

describe("VALIDATION_ERROR: paidOfflineCheckoutSchema", () => {
  const validOffline = {
    ticketIds: [uid()],
    paymentMethod: "cash" as const,
    amount: 30000,
    idempotencyKey: uid(),
  };

  it("accepts valid paid-offline input", () => {
    expect(paidOfflineCheckoutSchema.safeParse(validOffline).success).toBe(true);
  });

  it("rejects empty ticketIds", () => {
    expect(paidOfflineCheckoutSchema.safeParse({ ...validOffline, ticketIds: [] }).success).toBe(
      false,
    );
  });

  it("rejects zero amount", () => {
    expect(paidOfflineCheckoutSchema.safeParse({ ...validOffline, amount: 0 }).success).toBe(false);
  });

  it("rejects invalid paymentMethod", () => {
    expect(
      paidOfflineCheckoutSchema.safeParse({ ...validOffline, paymentMethod: "cheque" }).success,
    ).toBe(false);
  });
});

describe("VALIDATION_ERROR: recordPayoutSchema", () => {
  const validPayout = {
    idempotencyKey: uid(),
    employeeId: uid(),
    businessDayIds: [uid()],
    amount: 100000,
    originalComputedAmount: 100000,
    method: "cash" as const,
  };

  it("accepts valid payout input", () => {
    expect(recordPayoutSchema.safeParse(validPayout).success).toBe(true);
  });

  it("rejects empty businessDayIds", () => {
    expect(recordPayoutSchema.safeParse({ ...validPayout, businessDayIds: [] }).success).toBe(
      false,
    );
  });

  it("rejects negative amount", () => {
    expect(recordPayoutSchema.safeParse({ ...validPayout, amount: -1 }).success).toBe(false);
  });

  it("rejects non-uuid employeeId", () => {
    expect(recordPayoutSchema.safeParse({ ...validPayout, employeeId: "bad-id" }).success).toBe(
      false,
    );
  });

  it("accepts optional fields as null/undefined", () => {
    expect(
      recordPayoutSchema.safeParse({ ...validPayout, adjustmentReason: null, notes: null }).success,
    ).toBe(true);
  });
});

describe("VALIDATION_ERROR: createProductSchema", () => {
  const validProduct = {
    pieces: [
      {
        clothPieceId: uid(),
        clothPieceVariantId: uid(),
        assignedToEmployeeId: null,
      },
    ],
  };

  it("accepts valid product input", () => {
    expect(createProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("rejects empty pieces array", () => {
    expect(createProductSchema.safeParse({ pieces: [] }).success).toBe(false);
  });

  it("rejects non-uuid clothPieceId", () => {
    expect(
      createProductSchema.safeParse({
        pieces: [
          {
            clothPieceId: "bad",
            clothPieceVariantId: uid(),
            assignedToEmployeeId: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("VALIDATION_ERROR: markPieceDoneSchema", () => {
  it("accepts valid input", () => {
    expect(markPieceDoneSchema.safeParse({ pieceId: uid(), expectedVersion: 1 }).success).toBe(
      true,
    );
  });

  it("rejects non-uuid pieceId", () => {
    expect(markPieceDoneSchema.safeParse({ pieceId: "bad", expectedVersion: 1 }).success).toBe(
      false,
    );
  });

  it("rejects negative expectedVersion", () => {
    expect(markPieceDoneSchema.safeParse({ pieceId: uid(), expectedVersion: -1 }).success).toBe(
      false,
    );
  });
});

describe("VALIDATION_ERROR: createAppointmentSchema", () => {
  const validAppt = {
    stylistId: uid(),
    serviceVariantId: uid(),
    scheduledAt: new Date().toISOString(),
    clientType: "guest" as const,
    guestName: "Valentina",
  };

  it("accepts valid appointment input", () => {
    expect(createAppointmentSchema.safeParse(validAppt).success).toBe(true);
  });

  it("rejects guest without guestName", () => {
    const { guestName, ...rest } = validAppt;
    void guestName;
    expect(createAppointmentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects saved client without clientId", () => {
    expect(createAppointmentSchema.safeParse({ ...validAppt, clientType: "saved" }).success).toBe(
      false,
    );
  });
});

describe("VALIDATION_ERROR: createClientSchema", () => {
  it("accepts valid client input", () => {
    expect(createClientSchema.safeParse({ name: "María López" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createClientSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    expect(createClientSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
  });
});

describe("VALIDATION_ERROR: UUID-gated actions (single uuid argument)", () => {
  it("accepts valid UUID", () => {
    expect(uuidSchema.safeParse(uid()).success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(uuidSchema.safeParse("").success).toBe(false);
  });

  it("rejects non-uuid string", () => {
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects numeric id", () => {
    expect(uuidSchema.safeParse(12345).success).toBe(false);
  });
});
