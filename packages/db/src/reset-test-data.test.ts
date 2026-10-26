import { describe, it, expect } from "vitest";
import { KEEP_TABLES, resetRefusal, tablesToReset } from "./reset-test-data";

// T135 — the reset refuses without both guards and never touches the setup.

const url = "postgresql://u:p@ep-test-123.us-east-1.aws.neon.tech/neondb";

describe("resetRefusal", () => {
  it("needs the explicit flag", () => {
    expect(
      resetRefusal({ argv: [], url, confirmHost: "ep-test-123.us-east-1.aws.neon.tech" }),
    ).toMatch(/--confirm-reset/);
  });

  it("needs the host typed, and it must match", () => {
    const argv = ["--confirm-reset"];
    expect(resetRefusal({ argv, url, confirmHost: undefined })).toMatch(/RESET_CONFIRM_HOST/);
    expect(resetRefusal({ argv, url, confirmHost: "ep-prod-999.us-east-1.aws.neon.tech" })).toMatch(
      /does not match/,
    );
    expect(resetRefusal({ argv, url: undefined, confirmHost: "x" })).toMatch(/RESET_DATABASE_URL/);
    expect(resetRefusal({ argv, url: "not a url", confirmHost: "x" })).toMatch(/valid URL/);
  });

  it("proceeds with both guards", () => {
    expect(
      resetRefusal({
        argv: ["--confirm-reset"],
        url,
        confirmHost: "ep-test-123.us-east-1.aws.neon.tech",
      }),
    ).toBeNull();
  });
});

describe("tablesToReset", () => {
  it("empties operational tables and keeps users, employees, catalog and settings", () => {
    const existing = [
      "pedidos",
      "tickets",
      "users",
      "employees",
      "services",
      "business_settings",
      "activity_log",
      "clients",
    ];
    expect(tablesToReset(existing)).toEqual(["activity_log", "clients", "pedidos", "tickets"]);
    for (const keep of [
      "users",
      "accounts",
      "employees",
      "cloth_piece_variants",
      "garment_sizes",
      "business_settings",
    ])
      expect(KEEP_TABLES.has(keep)).toBe(true);
  });

  it("is idempotent: the same input gives the same list", () => {
    const existing = ["tickets", "users"];
    expect(tablesToReset(existing)).toEqual(tablesToReset(existing));
  });
});
