/**
 * What a product allows on a pedido line — T138
 *
 * loadProductRules reads a product's setup (T137); checkLineDetails is the pure rule.
 * Anything a line already has stays valid, so changing a product's setup never makes
 * an existing pedido impossible to save. When a product limits a detail to some
 * values, typing another value would get around that, so it isn't allowed.
 */

import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../index";
import { details, detailValues, productDetails, productDetailValues } from "../schema";

export type ProductRule = {
  detailId: string;
  name: string;
  builtin: string | null;
  required: boolean;
  allValues: boolean;
  /** When not allValues: what this product comes in */
  allowedIds: string[];
  allowFreeText: boolean;
  splitsStock: boolean;
  /** Active values of a custom detail */
  values: { id: string; label: string }[];
};

export type LineDetailInput = {
  detailId: string;
  valueId?: string | null;
  valueOther?: string | null;
};

export type LineSpecs = {
  colorId: string | null;
  colorOther: string | null;
  style: string | null;
  sizeIds: string[];
  sizeOthers: string[];
  details: LineDetailInput[];
};

export async function loadProductRules(
  db: Pick<Database, "select">,
  pieceIds?: string[],
): Promise<Map<string, ProductRule[]>> {
  const rows = await db
    .select({
      clothPieceId: productDetails.clothPieceId,
      detailId: details.id,
      name: details.name,
      builtin: details.builtin,
      required: productDetails.required,
      allValues: productDetails.allValues,
      allowFreeText: details.allowFreeText,
      splitsStock: details.splitsStock,
    })
    .from(productDetails)
    .innerJoin(details, eq(details.id, productDetails.detailId))
    .where(pieceIds ? inArray(productDetails.clothPieceId, pieceIds) : undefined)
    .orderBy(asc(details.sortOrder), asc(details.name));
  const [chosen, values] = await Promise.all([
    db
      .select()
      .from(productDetailValues)
      .where(pieceIds ? inArray(productDetailValues.clothPieceId, pieceIds) : undefined),
    db
      .select({ id: detailValues.id, detailId: detailValues.detailId, label: detailValues.label })
      .from(detailValues)
      .where(eq(detailValues.isActive, true))
      .orderBy(asc(detailValues.sortOrder), asc(detailValues.label)),
  ]);
  const rules = new Map<string, ProductRule[]>();
  for (const r of rows) {
    const { clothPieceId, ...rule } = r;
    rules.set(clothPieceId, [
      ...(rules.get(clothPieceId) ?? []),
      {
        ...rule,
        allowedIds: chosen
          .filter((c) => c.clothPieceId === clothPieceId && c.detailId === r.detailId)
          .map((c) => c.valueId),
        values: values
          .filter((v) => v.detailId === r.detailId)
          .map((v) => ({ id: v.id, label: v.label })),
      },
    ]);
  }
  return rules;
}

/** Why this line doesn't fit its product, as { field, message }; empty when it does. */
export function checkLineDetails(
  rules: ProductRule[],
  line: LineSpecs,
  previous?: LineSpecs,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const rule = (builtin: string) => rules.find((r) => r.builtin === builtin);
  const lower = (v: string) => v.trim().toLowerCase();

  const size = rule("size");
  if (size && !size.allValues) {
    for (const id of line.sizeIds)
      if (!size.allowedIds.includes(id) && !previous?.sizeIds.includes(id))
        add("cells", "Este producto no viene en una de esas tallas.");
    for (const other of line.sizeOthers)
      if (!previous?.sizeOthers.map(lower).includes(lower(other)))
        add("cells", `Este producto no viene en la talla ${other}.`);
  }

  const color = rule("color");
  const sameColor =
    previous && previous.colorId === line.colorId && previous.colorOther === line.colorOther;
  if (!sameColor) {
    const has = Boolean(line.colorId || line.colorOther);
    if (!color && has) add("colorId", "Este producto no usa color.");
    if (color?.required && !has) add("colorId", "Elige el color.");
    if (color && !color.allValues) {
      if (line.colorOther) add("colorId", "Este producto no viene en ese color.");
      if (line.colorId && !color.allowedIds.includes(line.colorId))
        add("colorId", "Este producto no viene en ese color.");
    }
  }

  const style = rule("style");
  if ((line.style ?? "") !== (previous?.style ?? "") || !previous) {
    if (!style && line.style) add("style", "Este producto no usa estilo.");
    if (style?.required && !line.style) add("style", "Escribe el estilo.");
  }

  const custom = rules.filter((r) => !r.builtin);
  for (const d of line.details) {
    const r = custom.find((x) => x.detailId === d.detailId);
    const before = previous?.details.find((p) => p.detailId === d.detailId);
    if (
      before &&
      (before.valueId ?? null) === (d.valueId ?? null) &&
      (before.valueOther ?? null) === (d.valueOther ?? null)
    )
      continue;
    const field = `details.${d.detailId}`;
    if (!r) {
      add(field, "Este producto no usa ese detalle.");
      continue;
    }
    if (d.valueOther) {
      if (!r.allowFreeText || !r.allValues) add(field, `${r.name}: elige un valor de la lista.`);
    } else if (d.valueId) {
      const known = r.values.some((v) => v.id === d.valueId);
      if (!known || (!r.allValues && !r.allowedIds.includes(d.valueId)))
        add(field, `${r.name}: este producto no viene en ese valor.`);
    }
  }
  for (const r of custom)
    if (r.required) {
      const d = line.details.find((x) => x.detailId === r.detailId);
      if (!d?.valueId && !d?.valueOther) add(`details.${r.detailId}`, `Elige ${r.name}.`);
    }
  return errors;
}
