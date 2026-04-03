import { describe, it, expect } from "vitest";
import { formatMoney, formatDate, formatPercent, formatCount } from "../formatting";

describe("formatMoney", () => {
  it("formats COP amounts in Spanish locale", () => {
    const result = formatMoney(12500, "es");
    expect(result).toMatch(/12[.,\s]500/);
    expect(result).not.toMatch(/[.,]\d{1,2}$/);
  });

  it("formats zero", () => {
    const result = formatMoney(0, "es");
    expect(result).toMatch(/0/);
  });

  it("formats large amounts", () => {
    const result = formatMoney(1000000, "es");
    expect(result).toMatch(/1[.,\s]000[.,\s]000/);
  });

  it("formats in English locale", () => {
    const result = formatMoney(12500, "en");
    expect(result).toMatch(/12[.,\s]500/);
  });
});

describe("formatDate", () => {
  it("formats date in Spanish locale (DD/MM/YYYY)", () => {
    const date = new Date("2026-04-03T12:00:00Z");
    const result = formatDate(date, "es");
    expect(result).toBe("03/04/2026");
  });

  it("formats date in English locale (MM/DD/YYYY)", () => {
    const date = new Date("2026-04-03T12:00:00Z");
    const result = formatDate(date, "en");
    expect(result).toBe("04/03/2026");
  });

  it("accepts string dates", () => {
    const result = formatDate("2026-12-25T15:00:00Z", "es");
    expect(result).toBe("25/12/2026");
  });
});

describe("formatPercent", () => {
  it("formats basic percentage", () => {
    const result = formatPercent(15, "es");
    expect(result).toMatch(/15/);
    expect(result).toMatch(/%/);
  });

  it("formats zero percent", () => {
    const result = formatPercent(0, "es");
    expect(result).toMatch(/0/);
  });

  it("formats fractional percentage", () => {
    const result = formatPercent(33.33, "es");
    expect(result).toMatch(/33/);
  });
});

describe("formatCount", () => {
  it("formats count with thousand separators in Spanish", () => {
    const result = formatCount(1500, "es");
    expect(result).toMatch(/1[.,\s]500/);
  });

  it("formats count with thousand separators in English", () => {
    const result = formatCount(1500, "en");
    expect(result).toMatch(/1[.,\s]500/);
  });

  it("formats small numbers without separators", () => {
    expect(formatCount(42, "es")).toBe("42");
  });
});
