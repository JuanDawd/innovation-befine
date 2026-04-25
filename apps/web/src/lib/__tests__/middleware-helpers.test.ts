import { describe, it, expect } from "vitest";
import {
  isPublic,
  isShared,
  isSharedApp,
  isAuthenticatedApi,
  roleCanAccess,
  isFinancialBlockedForSecretary,
  ROLE_HOME,
} from "../middleware-helpers";

describe("isPublic", () => {
  it("allows /login without auth", () => {
    expect(isPublic("/login")).toBe(true);
  });

  it("allows /reset-password without auth", () => {
    expect(isPublic("/reset-password")).toBe(true);
  });

  it("allows /api/auth/* without auth", () => {
    expect(isPublic("/api/auth/sign-in")).toBe(true);
    expect(isPublic("/api/auth/get-session")).toBe(true);
  });

  it("allows /403 without auth", () => {
    expect(isPublic("/403")).toBe(true);
  });

  it("allows / (home) without auth", () => {
    expect(isPublic("/")).toBe(true);
  });

  it("requires auth for protected routes", () => {
    expect(isPublic("/cashier")).toBe(false);
    expect(isPublic("/secretary")).toBe(false);
    expect(isPublic("/admin/employees")).toBe(false);
  });

  it("allows /api/health and /api/version as exact matches only (T10R-R9)", () => {
    expect(isPublic("/api/health")).toBe(true);
    expect(isPublic("/api/version")).toBe(true);
  });

  it("does not allow /api/health or /api/version prefix variants (T10R-R9)", () => {
    expect(isPublic("/api/healthz")).toBe(false);
    expect(isPublic("/api/health-admin")).toBe(false);
    expect(isPublic("/api/version-internal")).toBe(false);
    expect(isPublic("/api/versions/old")).toBe(false);
  });
});

describe("isShared", () => {
  it("does not treat generic /api as shared", () => {
    expect(isShared("/api/analytics")).toBe(false);
    expect(isShared("/api/payouts")).toBe(false);
  });

  it("/api/realtime is no longer in SHARED_PATHS (moved to AUTHENTICATED_API_PATHS)", () => {
    expect(isShared("/api/realtime/cashier")).toBe(false);
    expect(isShared("/api/realtime/clothier")).toBe(false);
  });
});

describe("isAuthenticatedApi", () => {
  it("matches /api/realtime paths for authenticated session bypass", () => {
    expect(isAuthenticatedApi("/api/realtime/cashier")).toBe(true);
    expect(isAuthenticatedApi("/api/realtime/clothier")).toBe(true);
    expect(isAuthenticatedApi("/api/realtime/notifications")).toBe(true);
  });

  it("does not match other API paths", () => {
    expect(isAuthenticatedApi("/api/analytics")).toBe(false);
    expect(isAuthenticatedApi("/api/auth/sign-in")).toBe(false);
  });
});

describe("isSharedApp", () => {
  it("allows /profile for any authenticated role", () => {
    expect(isSharedApp("/profile")).toBe(true);
    expect(isSharedApp("/profile/settings")).toBe(true);
  });

  it("does not treat arbitrary paths as shared app", () => {
    expect(isSharedApp("/cashier")).toBe(false);
    expect(isSharedApp("/admin")).toBe(false);
  });
});

describe("roleCanAccess", () => {
  it("cashier_admin can access /cashier routes", () => {
    expect(roleCanAccess("cashier_admin", "/cashier")).toBe(true);
    expect(roleCanAccess("cashier_admin", "/cashier/tickets")).toBe(true);
  });

  it("cashier_admin can access /admin routes", () => {
    expect(roleCanAccess("cashier_admin", "/admin/employees")).toBe(true);
    expect(roleCanAccess("cashier_admin", "/admin/settings")).toBe(true);
  });

  it("secretary can access /secretary routes", () => {
    expect(roleCanAccess("secretary", "/secretary")).toBe(true);
    expect(roleCanAccess("secretary", "/secretary/appointments")).toBe(true);
  });

  it("secretary cannot access /cashier routes", () => {
    expect(roleCanAccess("secretary", "/cashier")).toBe(false);
    expect(roleCanAccess("secretary", "/cashier/tickets")).toBe(false);
  });

  it("secretary cannot access /admin routes", () => {
    expect(roleCanAccess("secretary", "/admin/employees")).toBe(false);
    expect(roleCanAccess("secretary", "/admin/settings")).toBe(false);
  });

  it("stylist can access /stylist routes", () => {
    expect(roleCanAccess("stylist", "/stylist")).toBe(true);
    expect(roleCanAccess("stylist", "/stylist/tickets")).toBe(true);
  });

  it("stylist cannot access other role routes", () => {
    expect(roleCanAccess("stylist", "/cashier")).toBe(false);
    expect(roleCanAccess("stylist", "/secretary")).toBe(false);
    expect(roleCanAccess("stylist", "/clothier")).toBe(false);
  });

  it("clothier can access /clothier routes", () => {
    expect(roleCanAccess("clothier", "/clothier")).toBe(true);
    expect(roleCanAccess("clothier", "/clothier/pieces")).toBe(true);
  });

  it("clothier cannot access other role routes", () => {
    expect(roleCanAccess("clothier", "/cashier")).toBe(false);
    expect(roleCanAccess("clothier", "/secretary")).toBe(false);
  });

  it("undefined role cannot access any route", () => {
    expect(roleCanAccess(undefined, "/cashier")).toBe(false);
    expect(roleCanAccess(undefined, "/secretary")).toBe(false);
  });

  it("all roles can access /profile (shared app path)", () => {
    expect(roleCanAccess("cashier_admin", "/profile")).toBe(true);
    expect(roleCanAccess("secretary", "/profile")).toBe(true);
    expect(roleCanAccess("stylist", "/profile")).toBe(true);
    expect(roleCanAccess("clothier", "/profile")).toBe(true);
  });

  it("cashier_admin and secretary can access /large-orders (shared app path)", () => {
    expect(roleCanAccess("cashier_admin", "/large-orders")).toBe(true);
    expect(roleCanAccess("cashier_admin", "/large-orders/new")).toBe(true);
    expect(roleCanAccess("cashier_admin", "/large-orders/abc-123")).toBe(true);
    expect(roleCanAccess("secretary", "/large-orders")).toBe(true);
    expect(roleCanAccess("secretary", "/large-orders/new")).toBe(true);
  });

  it("stylist and clothier can technically reach /large-orders path (middleware allows; server actions enforce role)", () => {
    // SHARED_APP_PATHS bypasses prefix check — server actions do the role gate
    expect(roleCanAccess("stylist", "/large-orders")).toBe(true);
    expect(roleCanAccess("clothier", "/large-orders")).toBe(true);
  });
});

describe("isFinancialBlockedForSecretary", () => {
  it("blocks secretary from analytics API", () => {
    expect(isFinancialBlockedForSecretary("/api/analytics")).toBe(true);
    expect(isFinancialBlockedForSecretary("/api/analytics/revenue")).toBe(true);
  });

  it("blocks secretary from payout API", () => {
    expect(isFinancialBlockedForSecretary("/api/payouts")).toBe(true);
    expect(isFinancialBlockedForSecretary("/api/payouts/123")).toBe(true);
  });

  it("blocks secretary from settlement API", () => {
    expect(isFinancialBlockedForSecretary("/api/settlements")).toBe(true);
  });

  it("blocks secretary from secretary-prefixed financial routes", () => {
    expect(isFinancialBlockedForSecretary("/secretary/analytics")).toBe(true);
    expect(isFinancialBlockedForSecretary("/secretary/revenue")).toBe(true);
    expect(isFinancialBlockedForSecretary("/secretary/settlements")).toBe(true);
    expect(isFinancialBlockedForSecretary("/secretary/payouts")).toBe(true);
  });

  it("does not block secretary from legitimate routes", () => {
    expect(isFinancialBlockedForSecretary("/secretary/appointments")).toBe(false);
    expect(isFinancialBlockedForSecretary("/secretary/clients")).toBe(false);
    expect(isFinancialBlockedForSecretary("/api/realtime/cashier")).toBe(false);
  });
});

describe("ROLE_HOME", () => {
  it("maps all four roles to their home paths", () => {
    expect(ROLE_HOME.cashier_admin).toBe("/cashier");
    expect(ROLE_HOME.secretary).toBe("/secretary");
    expect(ROLE_HOME.stylist).toBe("/stylist");
    expect(ROLE_HOME.clothier).toBe("/clothier");
  });
});
