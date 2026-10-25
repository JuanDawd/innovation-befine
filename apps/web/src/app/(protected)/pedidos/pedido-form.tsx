"use client";

/**
 * PedidoForm — T116 (spec §3.1)
 *
 * One form for creating and editing a pedido, used by the intercepted modal
 * and the full page. Client or inventory destination; garment lines with a
 * size grid; adjustment lines (admin/cashier). The total is always the sum of
 * the lines — there is no total field.
 */

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2Icon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { computePedidoTotal, lineUnits, type PedidoTotalLine } from "@befine/db/pedido-totals";
import { createPedidoSchema } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/hooks/use-toast";
import { notifyDataChanged } from "@/lib/data-events";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  createPedido,
  createPedidoClient,
  searchPedidoClients,
  updatePedido,
  type PedidoClientOption,
  type PedidoForEdit,
  type PedidoFormData,
} from "./actions";

// ─── Draft state ─────────────────────────────────────────────────────────────

const OTHER = "__other";

type GarmentDraft = {
  key: number;
  kind: "garment";
  id?: string;
  variantId: string;
  colorChoice: string;
  colorOther: string;
  style: string;
  instructions: string;
  /** sizeId → digits */
  qty: Record<string, string>;
  others: { key: number; label: string; qty: string }[];
  customPrice: boolean;
  price: string;
  priceReason: string;
  /** Stored snapshot when editing, kept while the variant is unchanged */
  snapshot?: { variantId: string; unitPrice: number; priceReason: string | null };
  /** Specs as stored, to spot changes on a line already in production (T119) */
  original?: { colorChoice: string; colorOther: string; style: string; instructions: string };
  changeReason: string;
};

type LineLimit = PedidoForEdit["limits"][string];

/** Size key used by the server limits: list size id or "other:<label>". */
const otherKey = (label: string) => `other:${label.trim().toLowerCase()}`;

function specsChanged(line: GarmentDraft): boolean {
  const o = line.original;
  if (!o) return false;
  return (
    o.colorChoice !== line.colorChoice ||
    (line.colorChoice === OTHER && o.colorOther.trim() !== line.colorOther.trim()) ||
    o.style.trim() !== line.style.trim() ||
    o.instructions.trim() !== line.instructions.trim()
  );
}

type AdjustmentDraft = {
  key: number;
  kind: "adjustment";
  id?: string;
  sign: "+" | "-";
  amount: string;
  reason: string;
};

type LineDraft = GarmentDraft | AdjustmentDraft;

let seq = 1;
const nextKey = () => seq++;

function emptyGarment(): GarmentDraft {
  return {
    key: nextKey(),
    kind: "garment",
    variantId: "",
    colorChoice: "",
    colorOther: "",
    style: "",
    instructions: "",
    qty: {},
    others: [],
    customPrice: false,
    price: "",
    priceReason: "",
    changeReason: "",
  };
}

function draftsFrom(pedido: PedidoForEdit | undefined): LineDraft[] {
  if (!pedido) return [emptyGarment()];
  return pedido.lines.map((l): LineDraft => {
    if (l.kind === "adjustment")
      return {
        key: nextKey(),
        kind: "adjustment",
        id: l.id,
        sign: l.amount < 0 ? "-" : "+",
        amount: String(Math.abs(l.amount)),
        reason: l.priceReason,
      };
    const specs = {
      colorChoice: l.colorId ?? (l.colorOther ? OTHER : ""),
      colorOther: l.colorOther ?? "",
      style: l.style ?? "",
      instructions: l.instructions ?? "",
    };
    return {
      key: nextKey(),
      kind: "garment",
      id: l.id,
      variantId: l.clothPieceVariantId,
      ...specs,
      original: specs,
      changeReason: "",
      qty: Object.fromEntries(
        l.cells.filter((c) => c.sizeId).map((c) => [c.sizeId!, String(c.quantity)]),
      ),
      others: l.cells
        .filter((c) => c.sizeOther)
        .map((c) => ({ key: nextKey(), label: c.sizeOther!, qty: String(c.quantity) })),
      customPrice: false,
      price: String(l.unitPrice),
      priceReason: l.priceReason ?? "",
      snapshot: {
        variantId: l.clothPieceVariantId,
        unitPrice: l.unitPrice,
        priceReason: l.priceReason ?? null,
      },
    };
  });
}

/** Price the line will be saved with, or null when one must be typed. */
function effectivePrice(line: GarmentDraft, sellingPrice: number | null): number | null {
  if (line.customPrice || (!line.snapshot && sellingPrice === null))
    return line.price === "" ? null : Number(line.price);
  if (line.snapshot && line.snapshot.variantId === line.variantId) return line.snapshot.unitPrice;
  return sellingPrice;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function ClientPicker({
  value,
  onChange,
  phone,
  onPhoneChange,
  errors,
}: {
  value: PedidoClientOption | null;
  onChange: (client: PedidoClientOption | null) => void;
  phone: string;
  onPhoneChange: (phone: string) => void;
  errors: Record<string, string>;
}) {
  const t = useTranslations("pedidos.form");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PedidoClientOption[]>([]);
  const [searching, startSearch] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (value || query.trim().length < 2) return;
    const handle = setTimeout(() => {
      startSearch(async () => {
        const res = await searchPedidoClients(query);
        setResults(res.success ? res.data : []);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value]);

  function saveNew() {
    startSave(async () => {
      const res = await createPedidoClient({ name: newName, phone: newPhone });
      if (!res.success) {
        const errs: Record<string, string> = {};
        res.error.details?.forEach((d) => (errs[d.field] = d.message));
        if (!res.error.details) errs.name = res.error.message;
        setCreateError(errs);
        return;
      }
      showToast("success", t("clientCreated"));
      onChange(res.data);
      setCreating(false);
      setNewName("");
      setNewPhone("");
      setCreateError({});
    });
  }

  if (value) {
    const needsPhone = !value.phone?.trim();
    return (
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <UserIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.name}</p>
            <p className="text-xs text-muted-foreground">{value.phone || t("noPhone")}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("changeClient")}
          </Button>
        </div>
        {needsPhone && (
          <div className="space-y-1.5">
            <label htmlFor="pedido-client-phone" className="text-sm font-medium">
              {t("addPhone")}
            </label>
            <Input
              id="pedido-client-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              aria-invalid={!!errors.clientPhone}
              aria-describedby={errors.clientPhone ? "pedido-client-phone-error" : undefined}
            />
            <FieldError id="pedido-client-phone-error" message={errors.clientPhone} />
          </div>
        )}
      </div>
    );
  }

  if (creating) {
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("newClient")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="pedido-new-client-name" className="text-sm font-medium">
              {t("clientName")}
            </label>
            <Input
              id="pedido-new-client-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-invalid={!!createError.name}
              aria-describedby={createError.name ? "pedido-new-client-name-error" : undefined}
            />
            <FieldError id="pedido-new-client-name-error" message={createError.name} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pedido-new-client-phone" className="text-sm font-medium">
              {t("clientPhone")}
            </label>
            <Input
              id="pedido-new-client-phone"
              inputMode="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              aria-invalid={!!createError.phone}
              aria-describedby={createError.phone ? "pedido-new-client-phone-error" : undefined}
            />
            <FieldError id="pedido-new-client-phone-error" message={createError.phone} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={saveNew} disabled={saving}>
            {saving && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("saveClient")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="clientId"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchClient")}
            aria-label={t("searchClient")}
            className="pl-8"
            aria-invalid={!!errors.clientId}
            aria-describedby={errors.clientId ? "clientId-error" : undefined}
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCreating(true);
            setNewName(/\d/.test(query) ? "" : query);
            setNewPhone(/\d/.test(query) ? query : "");
          }}
        >
          <UserPlusIcon className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">{t("newClient")}</span>
        </Button>
      </div>
      <FieldError id="clientId-error" message={errors.clientId} />
      {query.trim().length >= 2 && (
        <div className="rounded-lg border" aria-live="polite">
          {searching && results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{tc("loading")}</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("noClients")}</p>
          ) : (
            <ul className="max-h-60 divide-y overflow-y-auto">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.phone || t("noPhone")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Garment line ────────────────────────────────────────────────────────────

function GarmentLine({
  index,
  line,
  data,
  onChange,
  onRemove,
  canRemove,
  errors,
  limit,
}: {
  index: number;
  line: GarmentDraft;
  data: PedidoFormData;
  onChange: (patch: Partial<GarmentDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors: Record<string, string>;
  /** Production limits when editing a stored line (T119) */
  limit?: LineLimit;
}) {
  const t = useTranslations("pedidos.form");
  const started = !!limit?.started;
  const minFor = (key: string) => limit?.cells[key]?.min ?? 0;
  const lockedFor = (key: string) => !!limit?.cells[key]?.locked;
  const uid = useId();
  const p = `lines.${index}`;
  const err = (field: string) => errors[`${p}.${field}`];

  const variant = data.variants.find((v) => v.id === line.variantId);
  const sellingPrice = variant?.sellingPrice ?? null;
  const unitPrice = variant ? effectivePrice(line, sellingPrice) : null;
  const keepsSnapshot = !!line.snapshot && line.snapshot.variantId === line.variantId;
  const needsTypedPrice = !!variant && !keepsSnapshot && sellingPrice === null;
  const showPriceInput = line.customPrice || needsTypedPrice;
  const units =
    Object.values(line.qty).reduce((n, q) => n + (Number(q) || 0), 0) +
    line.others.reduce((n, o) => n + (Number(o.qty) || 0), 0);

  // Active sizes, plus deactivated ones this line already uses.
  const sizes = data.sizes.filter((s) => s.isActive || line.qty[s.id]);
  const colors = data.colors.filter((c) => c.isActive || c.id === line.colorChoice);
  const pieces = useMemo(() => {
    const groups = new Map<string, PedidoFormData["variants"]>();
    for (const v of data.variants) {
      if (!v.isActive && v.id !== line.variantId) continue;
      groups.set(v.pieceName, [...(groups.get(v.pieceName) ?? []), v]);
    }
    return [...groups];
  }, [data.variants, line.variantId]);

  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="sr-only">{t("lineLegend", { n: index + 1 })}</legend>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={`${uid}-variant`} className="text-sm font-medium">
            {t("garment")}
          </label>
          <NativeSelect
            id={`${uid}-variant`}
            value={line.variantId}
            onChange={(e) =>
              onChange({
                variantId: e.target.value,
                customPrice: false,
                price: "",
                priceReason: "",
              })
            }
            className="w-full"
            disabled={started}
            aria-invalid={!!err("clothPieceVariantId")}
            aria-describedby={
              err("clothPieceVariantId")
                ? `${uid}-variant-error`
                : started
                  ? `${uid}-variant-locked`
                  : undefined
            }
          >
            <option value="">{t("chooseGarment")}</option>
            {pieces.map(([piece, variants]) => (
              <optgroup key={piece} label={piece}>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {`${piece} — ${v.variantName} · ${
                      v.sellingPrice != null ? formatMoney(v.sellingPrice) : t("noSellingPrice")
                    }`}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          {started && (
            <p id={`${uid}-variant-locked`} className="text-xs text-muted-foreground">
              {t("inProductionLocked")}
            </p>
          )}
          <FieldError id={`${uid}-variant-error`} message={err("clothPieceVariantId")} />
        </div>
        {canRemove && !started && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={t("removeLine", { n: index + 1 })}
            className="mt-6 text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Size grid */}
      <div className="space-y-2">
        <p className="text-sm font-medium" id={`${uid}-sizes`}>
          {t("sizes")}
        </p>
        <div
          role="group"
          aria-labelledby={`${uid}-sizes`}
          className="grid grid-cols-4 gap-2 sm:grid-cols-7"
        >
          {sizes.map((s) => (
            <div key={s.id} className="space-y-1">
              <label
                htmlFor={`${uid}-size-${s.id}`}
                className="block text-center text-xs font-medium text-muted-foreground"
              >
                {s.label}
              </label>
              <Input
                id={`${uid}-size-${s.id}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-describedby={minFor(s.id) > 0 ? `${uid}-size-${s.id}-min` : undefined}
                value={line.qty[s.id] ?? ""}
                onChange={(e) =>
                  onChange({
                    qty: { ...line.qty, [s.id]: e.target.value.replace(/\D/g, "").slice(0, 5) },
                  })
                }
                className="text-center font-mono tabular-nums"
              />
              {minFor(s.id) > 0 && (
                <p
                  id={`${uid}-size-${s.id}-min`}
                  className="text-center text-[0.6875rem] text-muted-foreground"
                >
                  {t("minUnits", { n: minFor(s.id) })}
                </p>
              )}
            </div>
          ))}
        </div>
        {line.others.map((o, j) => (
          <div key={o.key} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor={`${uid}-other-${o.key}`} className="text-xs text-muted-foreground">
                {t("otherSize")}
              </label>
              <Input
                id={`${uid}-other-${o.key}`}
                value={o.label}
                maxLength={20}
                onChange={(e) =>
                  onChange({
                    others: line.others.map((x) =>
                      x.key === o.key ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
            <div className="w-24 space-y-1">
              <label
                htmlFor={`${uid}-other-qty-${o.key}`}
                className="text-xs text-muted-foreground"
              >
                {t("units")}
              </label>
              <Input
                id={`${uid}-other-qty-${o.key}`}
                inputMode="numeric"
                placeholder="0"
                value={o.qty}
                onChange={(e) =>
                  onChange({
                    others: line.others.map((x) =>
                      x.key === o.key
                        ? { ...x, qty: e.target.value.replace(/\D/g, "").slice(0, 5) }
                        : x,
                    ),
                  })
                }
                className="text-center font-mono tabular-nums"
              />
            </div>
            {lockedFor(otherKey(o.label)) ? (
              <span className="w-11 pb-2 text-center text-xs text-muted-foreground">
                {t("minUnits", { n: minFor(otherKey(o.label)) })}
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeOtherSize", { n: j + 1 })}
                onClick={() => onChange({ others: line.others.filter((x) => x.key !== o.key) })}
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ others: [...line.others, { key: nextKey(), label: "", qty: "" }] })
            }
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("addOtherSize")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("lineUnits", { count: units })}</p>
        </div>
        <FieldError id={`${uid}-cells-error`} message={err("cells")} />
      </div>

      {/* Colour, style, instructions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-color`} className="text-sm font-medium">
            {t("color")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <NativeSelect
            id={`${uid}-color`}
            value={line.colorChoice}
            onChange={(e) => onChange({ colorChoice: e.target.value })}
            className="w-full"
            aria-invalid={!!err("colorId")}
          >
            <option value="">{t("noColor")}</option>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value={OTHER}>{t("otherColor")}</option>
          </NativeSelect>
          {line.colorChoice === OTHER && (
            <Input
              aria-label={t("otherColorLabel")}
              placeholder={t("otherColorLabel")}
              value={line.colorOther}
              maxLength={40}
              onChange={(e) => onChange({ colorOther: e.target.value })}
            />
          )}
          <FieldError id={`${uid}-color-error`} message={err("colorId")} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-style`} className="text-sm font-medium">
            {t("style")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <Input
            id={`${uid}-style`}
            value={line.style}
            maxLength={200}
            placeholder={t("stylePlaceholder")}
            onChange={(e) => onChange({ style: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-instructions`} className="text-sm font-medium">
          {t("instructions")} <span className="text-muted-foreground">{t("optional")}</span>
        </label>
        <textarea
          id={`${uid}-instructions`}
          value={line.instructions}
          maxLength={1000}
          rows={2}
          onChange={(e) => onChange({ instructions: e.target.value })}
          className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </div>
      {started && specsChanged(line) && (
        <div className="space-y-1.5 rounded-lg border border-status-attention-foreground/30 bg-status-attention/40 p-3">
          <label htmlFor={`${uid}-change-reason`} className="text-sm font-medium">
            {t("changeReason")}
          </label>
          <Input
            id={`${uid}-change-reason`}
            value={line.changeReason}
            maxLength={300}
            placeholder={t("changeReasonPlaceholder")}
            onChange={(e) => onChange({ changeReason: e.target.value })}
            aria-invalid={!!err("changeReason")}
            aria-describedby={`${uid}-change-reason-help${err("changeReason") ? ` ${uid}-change-reason-error` : ""}`}
          />
          <p id={`${uid}-change-reason-help`} className="text-xs text-muted-foreground">
            {t("changeReasonHelp")}
          </p>
          <FieldError id={`${uid}-change-reason-error`} message={err("changeReason")} />
        </div>
      )}

      {/* Price */}
      {variant && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {unitPrice != null
                ? t("priceLine", { price: formatMoney(unitPrice), units })
                : t("priceMissing")}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {unitPrice != null ? formatMoney(unitPrice * units) : "—"}
            </span>
          </div>
          {needsTypedPrice && !data.canEditPrices && (
            <p className="text-sm text-destructive" role="alert">
              {t("noSellingPriceSecretary")}
            </p>
          )}
          {data.canEditPrices && !needsTypedPrice && !line.customPrice && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({ customPrice: true, price: unitPrice != null ? String(unitPrice) : "" })
              }
            >
              <PencilIcon className="size-4" aria-hidden="true" />
              {t("changePrice")}
            </Button>
          )}
          {data.canEditPrices && showPriceInput && (
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-price`} className="text-sm font-medium">
                  {t("unitPrice")}
                </label>
                <MoneyInput
                  id={`${uid}-price`}
                  value={line.price}
                  onValueChange={(digits) => onChange({ price: digits })}
                  aria-invalid={!!err("unitPrice")}
                  aria-describedby={err("unitPrice") ? `${uid}-price-error` : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
                  {t("priceReason")}
                </label>
                <Input
                  id={`${uid}-reason`}
                  value={line.priceReason}
                  maxLength={300}
                  placeholder={t("priceReasonPlaceholder")}
                  onChange={(e) => onChange({ priceReason: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <FieldError id={`${uid}-price-error`} message={err("unitPrice")} />
                {line.customPrice && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ customPrice: false, price: "", priceReason: "" })}
                  >
                    {t("useCatalogPrice")}
                  </Button>
                )}
              </div>
            </div>
          )}
          {!(data.canEditPrices && showPriceInput) && (
            <FieldError id={`${uid}-price-error`} message={err("unitPrice")} />
          )}
        </div>
      )}
    </fieldset>
  );
}

function AdjustmentLine({
  index,
  line,
  onChange,
  onRemove,
  editable,
  errors,
}: {
  index: number;
  line: AdjustmentDraft;
  onChange: (patch: Partial<AdjustmentDraft>) => void;
  onRemove: () => void;
  editable: boolean;
  errors: Record<string, string>;
}) {
  const t = useTranslations("pedidos.form");
  const uid = useId();
  const err = (field: string) => errors[`lines.${index}.${field}`];
  return (
    <fieldset className="space-y-3 rounded-xl border border-dashed p-4" disabled={!editable}>
      <legend className="px-1 text-sm font-medium">{t("adjustment")}</legend>
      <div className="grid gap-3 sm:grid-cols-[9rem_10rem_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-sign`} className="text-sm font-medium">
            {t("adjustmentType")}
          </label>
          <NativeSelect
            id={`${uid}-sign`}
            value={line.sign}
            onChange={(e) => onChange({ sign: e.target.value as "+" | "-" })}
            className="w-full"
          >
            <option value="+">{t("surcharge")}</option>
            <option value="-">{t("discount")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-amount`} className="text-sm font-medium">
            {t("amount")}
          </label>
          <MoneyInput
            id={`${uid}-amount`}
            value={line.amount}
            onValueChange={(digits) => onChange({ amount: digits })}
            aria-invalid={!!err("amount")}
            aria-describedby={err("amount") ? `${uid}-amount-error` : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
            {t("adjustmentReason")}
          </label>
          <Input
            id={`${uid}-reason`}
            value={line.reason}
            maxLength={300}
            placeholder={t("adjustmentReasonPlaceholder")}
            onChange={(e) => onChange({ reason: e.target.value })}
            aria-invalid={!!err("priceReason")}
            aria-describedby={err("priceReason") ? `${uid}-reason-error` : undefined}
          />
        </div>
        {editable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={t("removeAdjustment")}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <FieldError id={`${uid}-amount-error`} message={err("amount")} />
      <FieldError id={`${uid}-reason-error`} message={err("priceReason")} />
    </fieldset>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function PedidoForm({ data, pedido }: { data: PedidoFormData; pedido?: PedidoForEdit }) {
  const t = useTranslations("pedidos.form");
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [destination, setDestination] = useState<"client" | "inventory">(
    pedido?.destination ?? "client",
  );
  const [client, setClient] = useState<PedidoClientOption | null>(pedido?.client ?? null);
  const [clientPhone, setClientPhone] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => draftsFrom(pedido));
  const [deliveryDate, setDeliveryDate] = useState(pedido?.estimatedDeliveryDate ?? "");
  const [notes, setNotes] = useState(pedido?.notes ?? "");
  /** Errors returned by the server on the last submit (field → message) */
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function buildPayload(): unknown {
    const payloadLines = lines.map((l) => {
      if (l.kind === "adjustment")
        return {
          kind: "adjustment" as const,
          ...(l.id ? { id: l.id } : {}),
          amount: (l.sign === "-" ? -1 : 1) * Number(l.amount || 0),
          priceReason: l.reason,
        };
      const variant = data.variants.find((v) => v.id === l.variantId);
      const price = variant ? effectivePrice(l, variant.sellingPrice) : null;
      const keeps =
        !l.customPrice && l.snapshot && l.snapshot.variantId === l.variantId && !!variant;
      return {
        kind: "garment" as const,
        ...(l.id ? { id: l.id } : {}),
        clothPieceVariantId: l.variantId,
        colorId: l.colorChoice && l.colorChoice !== OTHER ? l.colorChoice : undefined,
        colorOther: l.colorChoice === OTHER ? l.colorOther : undefined,
        style: l.style,
        instructions: l.instructions,
        unitPrice: price ?? Number.NaN,
        priceReason: keeps ? (l.snapshot!.priceReason ?? undefined) : l.priceReason,
        changeReason: specsChanged(l) ? l.changeReason : undefined,
        cells: [
          ...Object.entries(l.qty)
            .filter(([, q]) => Number(q) > 0)
            .map(([sizeId, q]) => ({ sizeId, quantity: Number(q) })),
          ...l.others
            .filter((o) => o.label.trim() || Number(o.qty) > 0)
            .map((o) => ({ sizeOther: o.label, quantity: Number(o.qty) })),
        ],
      };
    });
    return {
      destination,
      clientId: destination === "client" ? client?.id : undefined,
      clientPhone: destination === "client" ? clientPhone : undefined,
      estimatedDeliveryDate: deliveryDate,
      notes,
      lines: payloadLines,
      ...(pedido ? { version: pedido.version } : {}),
    };
  }

  /** Client-side check with the same schema the server uses. */
  function validate(): Record<string, string> {
    const parsed = createPedidoSchema.safeParse(buildPayload());
    const errs: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        // Cell problems are shown once, under the line's grid.
        const field = key.replace(/^(lines\.\d+)\.cells\.\d+\.\w+$/, "$1.cells");
        errs[field] ??= issue.message;
      }
    // The schema's cross-field checks only run once every field parses, so
    // repeat the ones people hit first here.
    if (destination === "client" && !client) errs.clientId ??= t("clientRequired");
    if (destination === "client" && client && !client.phone?.trim() && !clientPhone.trim())
      errs.clientPhone = t("phoneRequired");
    // Production limits on lines being edited (T119); the server checks them too.
    lines.forEach((l, i) => {
      if (l.kind !== "garment" || !l.id) return;
      const limit = pedido?.limits[l.id];
      if (!limit?.started) return;
      if (specsChanged(l) && !l.changeReason.trim())
        errs[`lines.${i}.changeReason`] ??= t("changeReasonRequired");
      const typed = new Map<string, number>([
        ...Object.entries(l.qty).map(([k, q]) => [k, Number(q) || 0] as const),
        ...l.others.map((o) => [otherKey(o.label), Number(o.qty) || 0] as const),
      ]);
      for (const [key, { min }] of Object.entries(limit.cells)) {
        if (min > 0 && (typed.get(key) ?? 0) < min) {
          const label = key.startsWith("other:")
            ? key.slice(6)
            : (data.sizes.find((s) => s.id === key)?.label ?? "");
          errs[`lines.${i}.cells`] ??= t("belowMinimum", { size: label, n: min });
        }
      }
    });
    lines.forEach((l, i) => {
      if (l.kind !== "garment" || !l.variantId) return;
      const variant = data.variants.find((v) => v.id === l.variantId);
      const keeps = !!l.snapshot && l.snapshot.variantId === l.variantId && !l.customPrice;
      if (!variant || keeps) return;
      const price = effectivePrice(l, variant.sellingPrice);
      const key = `lines.${i}.unitPrice`;
      if (price === null) errs[key] ??= t("priceMissing");
      else if (price !== variant.sellingPrice && !l.priceReason.trim())
        errs[key] ??=
          variant.sellingPrice === null ? t("priceAndReasonRequired") : t("reasonRequired");
    });
    return errs;
  }

  // After the first submit, client-side errors update as the form is corrected.
  const errors: Record<string, string> = submitted ? { ...serverErrors, ...validate() } : {};

  const total = useMemo(() => {
    try {
      return computePedidoTotal(
        lines.flatMap((l): PedidoTotalLine[] => {
          if (l.kind === "adjustment")
            return Number(l.amount) > 0
              ? [
                  {
                    kind: "adjustment" as const,
                    amount: (l.sign === "-" ? -1 : 1) * Number(l.amount),
                  },
                ]
              : [];
          const variant = data.variants.find((v) => v.id === l.variantId);
          const price = variant ? effectivePrice(l, variant.sellingPrice) : null;
          const cells = [
            ...Object.values(l.qty).filter((q) => Number(q) > 0),
            ...l.others.map((o) => o.qty).filter((q) => Number(q) > 0),
          ].map((q) => ({ quantity: Number(q) }));
          return price != null && cells.length
            ? [{ kind: "garment" as const, unitPrice: price, cells }]
            : [];
        }),
      );
    } catch {
      return null;
    }
  }, [lines, data.variants]);
  const units = lines.reduce((n, l) => {
    if (l.kind !== "garment") return n;
    const cells = [...Object.values(l.qty), ...l.others.map((o) => o.qty)]
      .map(Number)
      .filter((q) => q > 0)
      .map((quantity) => ({ quantity }));
    return n + lineUnits(cells);
  }, 0);

  function update(key: number, patch: Partial<GarmentDraft> | Partial<AdjustmentDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as LineDraft) : l)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    const errs = validate();
    if (Object.keys(errs).length) {
      setFormError(t("fixErrors"));
      return;
    }
    startTransition(async () => {
      const payload = buildPayload();
      const res = pedido ? await updatePedido(pedido.id, payload) : await createPedido(payload);
      if (!res.success) {
        const errs: Record<string, string> = {};
        res.error.details?.forEach((d) => (errs[d.field] = d.message));
        setServerErrors(errs);
        setFormError(res.error.message);
        showToast("error", res.error.message);
        return;
      }
      const credit = (res.data as { saldoAFavor?: number }).saldoAFavor ?? 0;
      showToast(
        "success",
        !pedido
          ? t("created")
          : credit > 0
            ? t("updatedWithCredit", { amount: formatMoney(credit) })
            : t("updated"),
      );
      notifyDataChanged("pedidos");
      window.location.assign(`/pedidos/${res.data.id}`);
    });
  }

  const garmentCount = lines.filter((l) => l.kind === "garment").length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Destination */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("destination")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["client", t("forClient"), UserIcon],
              ["inventory", t("forInventory"), PackageIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <label
              key={value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                destination === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="destination"
                value={value}
                checked={destination === value}
                disabled={!!pedido?.started && destination !== value}
                onChange={() => setDestination(value)}
                className="sr-only"
              />
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
        {destination === "client" ? (
          <ClientPicker
            value={client}
            onChange={setClient}
            phone={clientPhone}
            onPhoneChange={setClientPhone}
            errors={errors}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("inventoryHint")}</p>
        )}
      </fieldset>

      {/* Lines */}
      <section aria-labelledby="pedido-lines" className="space-y-3">
        <h2 id="pedido-lines" className="text-lg font-semibold">
          {t("garments")}
        </h2>
        {errors.lines && <p className="text-sm text-destructive">{errors.lines}</p>}
        {lines.map((line, i) =>
          line.kind === "garment" ? (
            <GarmentLine
              key={line.key}
              index={i}
              line={line}
              data={data}
              onChange={(patch) => update(line.key, patch)}
              onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              canRemove={garmentCount > 1}
              errors={errors}
              limit={line.id ? pedido?.limits[line.id] : undefined}
            />
          ) : (
            <AdjustmentLine
              key={line.key}
              index={i}
              line={line}
              onChange={(patch) => update(line.key, patch)}
              onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              editable={data.canEditPrices}
              errors={errors}
            />
          ),
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLines((prev) => [...prev, emptyGarment()])}
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("addGarment")}
          </Button>
          {data.canEditPrices && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { key: nextKey(), kind: "adjustment", sign: "+", amount: "", reason: "" },
                ])
              }
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              {t("addAdjustment")}
            </Button>
          )}
        </div>
      </section>

      {/* Delivery and notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="pedido-delivery" className="text-sm font-medium">
            {t("deliveryDate")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <Input
            id="pedido-delivery"
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            aria-invalid={!!errors.estimatedDeliveryDate}
          />
          <FieldError id="pedido-delivery-error" message={errors.estimatedDeliveryDate} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="pedido-notes" className="text-sm font-medium">
            {t("notes")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <textarea
            id="pedido-notes"
            value={notes}
            maxLength={1000}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </div>
      </div>

      {/* Total and submit */}
      <div className="sticky bottom-0 -mx-1 space-y-3 border-t bg-background/95 px-1 pt-3 pb-1 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">{t("totalLabel", { count: units })}</span>
          <span className="font-mono text-lg font-semibold tabular-nums" aria-live="polite">
            {total != null ? formatMoney(total) : "—"}
          </span>
        </div>
        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
          {pedido ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
