import { describe, expect, it } from "vitest";
import { checkLineDetails, type LineSpecs, type ProductRule } from "./product-rules";

const rule = (over: Partial<ProductRule>): ProductRule => ({
  detailId: "d",
  name: "Tela",
  builtin: null,
  required: false,
  allValues: true,
  allowedIds: [],
  allowFreeText: false,
  splitsStock: false,
  values: [
    { id: "seda", label: "Seda" },
    { id: "lino", label: "Lino" },
  ],
  ...over,
});
const line = (over: Partial<LineSpecs> = {}): LineSpecs => ({
  colorId: null,
  colorOther: null,
  style: null,
  sizeIds: [],
  sizeOthers: [],
  details: [],
  ...over,
});
const messages = (...args: Parameters<typeof checkLineDetails>) =>
  checkLineDetails(...args).map((e) => e.message);

describe("checkLineDetails", () => {
  it("accepts a line that fits", () => {
    const rules = [rule({ builtin: "size" }), rule({ builtin: "color" }), rule({})];
    expect(
      messages(
        rules,
        line({ sizeIds: ["s"], colorId: "c", details: [{ detailId: "d", valueId: "seda" }] }),
      ),
    ).toEqual([]);
  });

  it("refuses a size or colour the product doesn't come in", () => {
    const rules = [
      rule({ builtin: "size", allValues: false, allowedIds: ["s"] }),
      rule({ builtin: "color", allValues: false, allowedIds: ["c"] }),
    ];
    expect(messages(rules, line({ sizeIds: ["m"] }))).toHaveLength(1);
    expect(messages(rules, line({ sizeOthers: ["XXL"] }))).toHaveLength(1);
    expect(messages(rules, line({ colorId: "x" }))).toHaveLength(1);
    expect(messages(rules, line({ colorOther: "Fucsia" }))).toHaveLength(1);
    expect(messages(rules, line({ sizeIds: ["s"], colorId: "c" }))).toEqual([]);
  });

  it("requires what is required", () => {
    expect(messages([rule({ builtin: "color", required: true })], line())).toEqual([
      "Elige el color.",
    ]);
    expect(messages([rule({ builtin: "style", required: true })], line())).toEqual([
      "Escribe el estilo.",
    ]);
    expect(messages([rule({ required: true })], line())).toEqual(["Elige Tela."]);
  });

  it("refuses details the product doesn't use", () => {
    expect(messages([], line({ colorId: "c" }))).toEqual(["Este producto no usa color."]);
    expect(messages([], line({ style: "Clásico" }))).toEqual(["Este producto no usa estilo."]);
    expect(messages([], line({ details: [{ detailId: "d", valueId: "seda" }] }))).toHaveLength(1);
  });

  it("allows typing only when the detail does and the product isn't limited", () => {
    const typed = line({ details: [{ detailId: "d", valueOther: "Algodón" }] });
    expect(messages([rule({})], typed)).toHaveLength(1);
    expect(messages([rule({ allowFreeText: true })], typed)).toEqual([]);
    expect(
      messages([rule({ allowFreeText: true, allValues: false, allowedIds: ["seda"] })], typed),
    ).toHaveLength(1);
  });

  it("refuses a value from outside the list or the product's choice", () => {
    expect(messages([rule({})], line({ details: [{ detailId: "d", valueId: "x" }] }))).toHaveLength(
      1,
    );
    expect(
      messages(
        [rule({ allValues: false, allowedIds: ["seda"] })],
        line({ details: [{ detailId: "d", valueId: "lino" }] }),
      ),
    ).toHaveLength(1);
  });

  it("keeps what a line already has, even after the product changed", () => {
    const before = line({
      colorId: "old",
      style: "Clásico",
      sizeIds: ["old"],
      sizeOthers: ["XXL"],
      details: [{ detailId: "gone", valueId: "v" }],
    });
    const rules = [
      rule({ builtin: "size", allValues: false, allowedIds: ["s"] }),
      rule({ builtin: "color", allValues: false, allowedIds: ["c"] }),
    ];
    expect(messages(rules, before, before)).toEqual([]);
    const stored = line({ details: [{ detailId: "gone", valueId: "v", valueOther: null }] });
    expect(
      messages(rules, line({ details: [{ detailId: "gone", valueId: "v" }] }), stored),
    ).toEqual([]);
  });
});
