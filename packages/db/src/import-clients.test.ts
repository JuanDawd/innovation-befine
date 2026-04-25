import { describe, expect, it } from "vitest";
import { parseCsvLine } from "./import-clients";

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
