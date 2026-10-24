import { describe, expect, it } from "vitest";
import { parseCsvLine, validateClientRow } from "./import-clients";

describe("parseCsvLine", () => {
  it("splits a simple unquoted row", () => {
    expect(parseCsvLine("Juan,3001234567,j@x.com,nota,0")).toEqual([
      "Juan",
      "3001234567",
      "j@x.com",
      "nota",
      "0",
    ]);
  });

  it("trims unquoted whitespace but preserves quoted whitespace", () => {
    expect(parseCsvLine('  Juan ,"  hola  ",x')).toEqual(["Juan", "  hola  ", "x"]);
  });

  it("handles a comma inside a quoted field (Colombian compound surname)", () => {
    expect(parseCsvLine('"De La Cruz, Juan Carlos","+57 300 000",j@x.com')).toEqual([
      "De La Cruz, Juan Carlos",
      "+57 300 000",
      "j@x.com",
    ]);
  });

  it("handles doubled-quote escape inside a quoted field", () => {
    expect(parseCsvLine('"Andrés ""Pepe"" Gómez",x,y')).toEqual(['Andrés "Pepe" Gómez', "x", "y"]);
  });

  it("preserves Spanish accented characters and ñ", () => {
    expect(parseCsvLine("María Peña,Ñoño,Iñárritu")).toEqual(["María Peña", "Ñoño", "Iñárritu"]);
  });

  it("returns empty trailing field when row ends with a comma", () => {
    expect(parseCsvLine("a,b,")).toEqual(["a", "b", ""]);
  });

  it("treats consecutive commas as empty fields", () => {
    expect(parseCsvLine("a,,b")).toEqual(["a", "", "b"]);
  });

  it("does not strip a leading-only naked quote (regression for old regex)", () => {
    expect(parseCsvLine('"De La Cruz')).toEqual(["De La Cruz"]);
  });

  it("supports a quoted field followed by an unquoted one", () => {
    expect(parseCsvLine('"a, b",c')).toEqual(["a, b", "c"]);
  });

  it("returns a single-element array for a value with no commas", () => {
    expect(parseCsvLine("solo")).toEqual(["solo"]);
  });

  it("returns one empty field for an empty line", () => {
    expect(parseCsvLine("")).toEqual([""]);
  });
});

describe("validateClientRow (M-09)", () => {
  const ok = {
    name: "Ana Gómez",
    phone: "+57 300 123 4567",
    email: "ana@example.com",
    notes: null,
    noShowCount: 0,
  };

  it("accepts a row that the client form would accept", () => {
    expect(validateClientRow(ok)).toBeNull();
    expect(validateClientRow({ ...ok, phone: "(601) 555-0199", email: null })).toBeNull();
  });

  it.each([
    ["name over 100 chars", { name: "x".repeat(101) }, /Name/],
    ["phone over 20 chars", { phone: "+57 300 123 4567 89012" }, /longer than 20/],
    ["letters in phone", { phone: "300-ABC-4567" }, /invalid characters/],
    ["too few digits", { phone: "12345" }, /7–15 digits/],
    ["too many digits", { phone: "1234567890123456" }, /7–15 digits/],
    ["malformed email", { email: "ana@example" }, /not valid/],
    ["email with spaces", { email: "ana gomez@example.com" }, /not valid/],
    ["email over 150 chars", { email: `${"a".repeat(140)}@example.com` }, /longer than 150/],
    ["notes over 500 chars", { notes: "n".repeat(501) }, /Notes/],
  ])("rejects %s", (_label, patch, reason) => {
    expect(validateClientRow({ ...ok, ...patch })).toMatch(reason);
  });
});
