import { describe, it, expect } from "vitest";
import type { AppRole, StylistSubtype } from "../roles";

describe("role types", () => {
  it("AppRole accepts valid roles", () => {
    const roles: AppRole[] = ["cashier_admin", "secretary", "stylist", "clothier"];
    expect(roles).toHaveLength(4);
  });

  it("StylistSubtype accepts valid subtypes", () => {
    const subtypes: StylistSubtype[] = [
      "manicurist",
      "spa_manager",
      "hairdresser",
      "masseuse",
      "makeup_artist",
    ];
    expect(subtypes).toHaveLength(5);
  });
});
