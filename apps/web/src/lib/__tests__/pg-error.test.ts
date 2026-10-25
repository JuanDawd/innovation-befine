import { describe, it, expect } from "vitest";
import { isUniqueViolation, pgErrorCode } from "../pg-error";

describe("pgErrorCode", () => {
  it("reads the code from a raw driver error", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("reads the code from a Drizzle-wrapped error's cause", () => {
    const wrapped = Object.assign(new Error("Failed query: insert …"), {
      cause: { code: "23P01" },
    });
    expect(pgErrorCode(wrapped)).toBe("23P01");
  });

  it("returns undefined for errors without a code", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode({ code: 42 })).toBeUndefined();
  });
});

describe("isUniqueViolation", () => {
  it("matches 23505 raw or wrapped only", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});
