"use client";

/**
 * Inventario — T128 (spec §3.6, §3.10)
 *
 * Stock per garment × size × colour, always the sum of its movements. Each
 * row opens its history (every movement with its source). Admin adjusts with
 * a reason; going below 0 needs the explicit override. Cashier views only.
 */

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  HistoryIcon,
  Loader2Icon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { StockItem, StockMovementRow } from "@befine/db";
import { STOCK_ADJUST_LABELS, STOCK_ADJUST_REASONS } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { newUuid } from "@/lib/uuid";
import { checkStockChange } from "@/lib/stock-rules";
import { cn } from "@/lib/utils";
import { adjustStock, getStockHistory, type Inventory } from "./actions";

type ItemKey = { clothPieceVariantId: string; sizeId: string | null; colorId: string | null };
const keyOf = (i: ItemKey) => `${i.clothPieceVariantId}:${i.sizeId ?? "-"}:${i.colorId ?? "-"}`;

function when(d: Date | string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(d));
}

// ─── Adjust dialog ───────────────────────────────────────────────────────────

function AdjustDialog({
  item,
  options,
  onClose,
}: {
  /** null = closed; "new" = choose garment, size and colour */
  item: StockItem | "new" | null;
  options: Inventory["options"];
  onClose: () => void;
}) {
  const t = useTranslations("inventario.adjust");
  const tc = useTranslations("common");
  const uid = useId();
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [colorId, setColorId] = useState("");
  const [direction, setDirection] = useState<"+" | "-">("+");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState<(typeof STOCK_ADJUST_REASONS)[number]>("conteo");
  const [note, setNote] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<StockItem | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  if (item !== openedFor) {
    setOpenedFor(item);
    setVariantId(item && item !== "new" ? item.clothPieceVariantId : "");
    setSizeId(item && item !== "new" ? (item.sizeId ?? "") : "");
    setColorId(item && item !== "new" ? (item.colorId ?? "") : "");
    setDirection("+");
    setQuantity("");
    setReasonCode("conteo");
    setNote("");
    setAllowNegative(false);
    setError(null);
    setKey(newUuid());
  }

  const onHand = item && item !== "new" ? item.onHand : 0;
  const signed = (direction === "-" ? -1 : 1) * (Number(quantity) || 0);
  const problem = quantity ? checkStockChange({ quantity: signed, onHand, allowNegative }) : null;
  const wouldGoNegative = onHand + signed < 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await adjustStock({
        clothPieceVariantId: variantId,
        sizeId: sizeId || null,
        colorId: colorId || null,
        quantity: signed,
        reasonCode,
        note: note || undefined,
        allowNegative: allowNegative || undefined,
        idempotencyKey: key,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      toast.success(t("done", { n: res.data.onHand }));
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {item && item !== "new"
              ? `${item.garment}${item.sizeLabel ? ` · ${item.sizeLabel}` : ""}${item.colorLabel ? ` · ${item.colorLabel}` : ""} · ${t("onHand", { n: onHand })}`
              : t("newDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {item === "new" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-variant`} className="text-sm font-medium">
                  {t("garment")}
                </label>
                <NativeSelect
                  id={`${uid}-variant`}
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  className="w-full"
                >
                  <option value="">{t("chooseGarment")}</option>
                  {options.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-size`} className="text-sm font-medium">
                    {t("size")}
                  </label>
                  <NativeSelect
                    id={`${uid}-size`}
                    value={sizeId}
                    onChange={(e) => setSizeId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">{t("noSize")}</option>
                    {options.sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-color`} className="text-sm font-medium">
                    {t("color")}
                  </label>
                  <NativeSelect
                    id={`${uid}-color`}
                    value={colorId}
                    onChange={(e) => setColorId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">{t("noColor")}</option>
                    {options.colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-dir`} className="text-sm font-medium">
                {t("direction")}
              </label>
              <NativeSelect
                id={`${uid}-dir`}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "+" | "-")}
                className="w-full"
              >
                <option value="+">{t("add")}</option>
                <option value="-">{t("remove")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-qty`} className="text-sm font-medium">
                {t("quantity")}
              </label>
              <Input
                id={`${uid}-qty`}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="font-mono tabular-nums"
                aria-invalid={!!problem}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
                {t("reason")}
              </label>
              <NativeSelect
                id={`${uid}-reason`}
                value={reasonCode}
                onChange={(e) =>
                  setReasonCode(e.target.value as (typeof STOCK_ADJUST_REASONS)[number])
                }
                className="w-full"
              >
                {STOCK_ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {STOCK_ADJUST_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-note`} className="text-sm font-medium">
                {t("note")}{" "}
                {reasonCode !== "otro" && (
                  <span className="text-muted-foreground">{tc("optional")}</span>
                )}
              </label>
              <Input
                id={`${uid}-note`}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          {wouldGoNegative && signed < 0 && (
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <input
                type="checkbox"
                checked={allowNegative}
                onChange={(e) => setAllowNegative(e.target.checked)}
                className="mt-0.5 size-4"
              />
              {t("override")}
            </label>
          )}
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
          <Button
            onClick={submit}
            disabled={
              isPending ||
              !variantId ||
              !quantity ||
              !!problem ||
              (reasonCode === "otro" && !note.trim())
            }
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────

function HistoryDialog({
  item,
  rows,
  onClose,
}: {
  item: StockItem | null;
  /** null while loading */
  rows: StockMovementRow[] | null;
  onClose: () => void;
}) {
  const t = useTranslations("inventario.history");

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {item && (
            <DialogDescription>
              {item.garment}
              {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
              {item.colorLabel ? ` · ${item.colorLabel}` : ""} · {t("onHand", { n: item.onHand })}
            </DialogDescription>
          )}
        </DialogHeader>
        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{t(`kinds.${m.kind}`)}</span>
                  {m.source && <span className="text-muted-foreground"> · {m.source}</span>}
                  {m.reason && (
                    <span className="block text-xs text-muted-foreground">{m.reason}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {when(m.createdAt)}
                    {m.createdByName && ` · ${m.createdByName}`}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums font-semibold",
                    m.quantity < 0 ? "text-destructive" : "text-status-success-foreground",
                  )}
                >
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function InventoryScreen({ data }: { data: Inventory }) {
  const t = useTranslations("inventario");
  const [q, setQ] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [adjusting, setAdjusting] = useState<StockItem | "new" | null>(null);
  const [history, setHistory] = useState<StockItem | null>(null);
  const [historyRows, setHistoryRows] = useState<StockMovementRow[] | null>(null);
  const [, startHistory] = useTransition();

  // Load on open (an event, not render): one request per opened item.
  function openHistory(item: StockItem) {
    setHistory(item);
    setHistoryRows(null);
    startHistory(async () => {
      const res = await getStockHistory({
        clothPieceVariantId: item.clothPieceVariantId,
        sizeId: item.sizeId,
        colorId: item.colorId,
      });
      setHistoryRows(res.success ? res.data : []);
    });
  }

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.items.filter(
      (i) =>
        (!onlyInStock || i.onHand !== 0) &&
        (!query ||
          [i.garment, i.sizeLabel, i.colorLabel]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)),
    );
  }, [data.items, q, onlyInStock]);
  const units = visible.reduce((n, i) => n + Math.max(i.onHand, 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="pl-8"
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground md:min-h-0">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(e) => setOnlyInStock(e.target.checked)}
            className="size-4"
          />
          {t("onlyInStock")}
        </label>
        {data.canAdjust && (
          <Button onClick={() => setAdjusting("new")}>
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("newAdjustment")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("summary", { items: visible.length, units })}
      </p>
      {visible.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((item) => (
            <li
              key={keyOf(item)}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => openHistory(item)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-md"
                aria-label={t("openHistory", { name: item.garment })}
              >
                {item.colorHex && (
                  <span
                    aria-hidden="true"
                    className="inline-block size-4 shrink-0 rounded-full border"
                    style={{ backgroundColor: item.colorHex }}
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.garment}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[item.sizeLabel ?? t("noSize"), item.colorLabel ?? t("noColor")].join(" · ")} ·{" "}
                    {t("lastMovement", { date: when(item.lastMovementAt) })}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold tabular-nums",
                    item.onHand > 0
                      ? "bg-muted"
                      : "bg-status-negative text-status-negative-foreground",
                  )}
                >
                  {item.onHand}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openHistory(item)}
                  aria-label={t("openHistory", { name: item.garment })}
                >
                  <HistoryIcon className="size-4" aria-hidden="true" />
                </Button>
                {data.canAdjust && (
                  <Button size="sm" variant="outline" onClick={() => setAdjusting(item)}>
                    <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
                    {t("adjustButton")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdjustDialog item={adjusting} options={data.options} onClose={() => setAdjusting(null)} />
      <HistoryDialog item={history} rows={historyRows} onClose={() => setHistory(null)} />
    </div>
  );
}
