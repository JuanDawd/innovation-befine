import { describe, it, expect } from "vitest";
import { txPoolMax } from "../index";

describe("txPoolMax (L-49)", () => {
  it("defaults to 5 when unset or invalid", () => {
    for (const raw of [undefined, "", "abc", "0", "-3", "2.5", "101"])
      expect(txPoolMax(raw)).toBe(5);
  });

  it("uses a configured size within 1–100", () => {
    expect(txPoolMax("1")).toBe(1);
    expect(txPoolMax("20")).toBe(20);
    expect(txPoolMax("100")).toBe(100);
  });
});
