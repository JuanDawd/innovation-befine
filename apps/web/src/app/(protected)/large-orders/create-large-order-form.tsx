"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { PlusIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLargeOrder, type ClientOption } from "./actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { LineAccordion, buildDescription, type OrderLine } from "./line-accordion";

type Props = {
  clients: ClientOption[];
  clothPieces: ClothPieceRow[];
  canOverridePrice: boolean;
};

export function CreateLargeOrderForm({ clients, clothPieces }: Props) {
  const t = useTranslations("largeOrders");
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [withDeposit, setWithDeposit] = useState(false);
  const [openKey, setOpenKey] = useState<number>(0);

  const [lines, setLines] = useState<OrderLine[]>([
    {
      key: 0,
      clothPieceId: "",
      clothPieceVariantId: "",
      quantity: 1,
      unitPrice: 0,
      itemDescription: "",
      color: "",
      style: "",
      size: "",
      instructions: "",
    },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const grandTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const generatedDescription = buildDescription(lines, clothPieces);

  function addLine() {
    const key = nextKey;
    setLines((prev) => [
      ...prev,
      {
        key,
        clothPieceId: "",
        clothPieceVariantId: "",
        quantity: 1,
        unitPrice: 0,
        itemDescription: "",
        color: "",
        style: "",
        size: "",
        instructions: "",
      },
    ]);
    setNextKey((k) => k + 1);
    setOpenKey(key);
  }

  function removeLine(key: number) {
    if (lines.length === 1) return;
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key);
      if (openKey === key) setOpenKey(next[next.length - 1].key);
      return next;
    });
  }

  function updateLine(key: number, patch: Partial<Omit<OrderLine, "key">>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        if (patch.clothPieceId !== undefined) {
          const piece = clothPieces.find((p) => p.id === patch.clothPieceId);
          const active = piece?.variants.filter((v) => v.isActive) ?? [];
          if (active.length === 1) {
            updated.clothPieceVariantId = active[0].id;
            updated.unitPrice = active[0].pieceRate;
          } else {
            updated.clothPieceVariantId = "";
            updated.unitPrice = 0;
          }
        }
        if (patch.clothPieceVariantId !== undefined) {
          const piece = clothPieces.find((p) => p.id === l.clothPieceId);
          const variant = piece?.variants.find((v) => v.id === patch.clothPieceVariantId);
          if (variant) updated.unitPrice = variant.pieceRate;
        }
        return updated;
      }),
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validate: all items need piece + variant + description
    const incomplete = lines.some(
      (l) => !l.clothPieceId || !l.clothPieceVariantId || !l.itemDescription.trim(),
    );
    if (incomplete) {
      setError(t("itemsRequired"));
      return;
    }

    const fd = new FormData(e.currentTarget);
    const depositAmountRaw = fd.get("initialDepositAmount") as string;
    const depositAmount = depositAmountRaw ? parseInt(depositAmountRaw, 10) : undefined;

    const validPieces = lines.filter((l) => l.clothPieceId && l.clothPieceVariantId);

    const input = {
      clientId: fd.get("clientId") as string,
      description: generatedDescription || (fd.get("description") as string),
      totalPrice: grandTotal > 0 ? grandTotal : parseInt(fd.get("totalPrice") as string, 10),
      estimatedDeliveryAt: (fd.get("estimatedDeliveryAt") as string)
        ? `${fd.get("estimatedDeliveryAt") as string}:00-05:00`
        : undefined,
      notes: (fd.get("notes") as string) || undefined,
      initialDepositAmount: withDeposit ? depositAmount : undefined,
      initialDepositMethod: withDeposit
        ? (fd.get("initialDepositMethod") as "cash" | "card" | "transfer")
        : undefined,
      pieces: validPieces.map((l) => ({
        clothPieceId: l.clothPieceId,
        clothPieceVariantId: l.clothPieceVariantId,
        quantity: l.quantity,
        color: l.color || undefined,
        style: l.style || undefined,
        size: l.size || undefined,
        instructions: l.instructions || undefined,
      })),
    };

    startTransition(async () => {
      const res = await createLargeOrder(input);
      if (!res.success) {
        if (res.error.code === "VALIDATION_ERROR" && "details" in res.error) {
          const errs: Record<string, string> = {};
          (res.error as { details?: { field: string; message: string }[] }).details?.forEach(
            (d) => (errs[d.field] = d.message),
          );
          setFieldErrors(errs);
        } else {
          setError(res.error.message);
          showToast("error", res.error.message);
        }
        return;
      }
      showToast("success", t("createSuccess"));
      window.location.href = `/large-orders/${res.data.id}`;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Client */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="clientId">
          {t("client")} <span className="text-destructive">*</span>
        </label>
        <select
          id="clientId"
          name="clientId"
          required
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
        >
          <option value="">{t("clientPlaceholder")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ""}
            </option>
          ))}
        </select>
        {fieldErrors.clientId && <p className="text-xs text-destructive">{fieldErrors.clientId}</p>}
      </div>

      {/* Items — required, accordion */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t("items")} <span className="text-destructive">*</span>
        </p>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <LineAccordion
              key={line.key}
              line={line}
              index={index}
              open={openKey === line.key}
              onToggle={() => setOpenKey(openKey === line.key ? -1 : line.key)}
              onRemove={() => removeLine(line.key)}
              onUpdate={(patch) => updateLine(line.key, patch)}
              clothPieces={clothPieces}
              canRemove={lines.length > 1}
              hasError={false}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <PlusIcon className="size-4" />
          {t("addItem")}
        </Button>
      </div>

      {/* Grand total */}
      {grandTotal > 0 && (
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("grandTotal")}</span>
          <span className="font-mono font-semibold">${grandTotal.toLocaleString("es-CO")}</span>
        </div>
      )}

      {/* Auto-generated description preview */}
      {generatedDescription && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">{t("generatedDescription")}</p>
          <pre className="w-full rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs font-sans whitespace-pre-wrap text-muted-foreground">
            {generatedDescription}
          </pre>
        </div>
      )}

      {/* Total price — hidden if auto-computed, shown for manual override */}
      {grandTotal === 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="totalPrice">
            {t("totalPrice")} <span className="text-destructive">*</span>
          </label>
          <input
            id="totalPrice"
            name="totalPrice"
            type="number"
            required
            min={1}
            step={1}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
          />
          {fieldErrors.totalPrice && (
            <p className="text-xs text-destructive">{fieldErrors.totalPrice}</p>
          )}
        </div>
      )}
      {/* Hidden field so totalPrice is always in the form when computed */}
      {grandTotal > 0 && <input type="hidden" name="totalPrice" value={grandTotal} />}

      {/* ETA */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="estimatedDeliveryAt">
          {t("estimatedDelivery")}
          <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
        </label>
        <input
          id="estimatedDeliveryAt"
          name="estimatedDeliveryAt"
          type="datetime-local"
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="notes">
          {t("notes")}
          <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          maxLength={1000}
          rows={2}
          placeholder={t("notesPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
        />
      </div>

      {/* Initial deposit toggle */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={withDeposit}
            onChange={(e) => setWithDeposit(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm font-medium">{t("initialDeposit")}</span>
        </label>

        {withDeposit && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="initialDepositAmount">
                {t("depositAmount")}
              </label>
              <input
                id="initialDepositAmount"
                name="initialDepositAmount"
                type="number"
                min={1}
                step={1}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="initialDepositMethod">
                {t("depositMethod")}
              </label>
              <select
                id="initialDepositMethod"
                name="initialDepositMethod"
                defaultValue="cash"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="cash">{t("cash")}</option>
                <option value="card">{t("card")}</option>
                <option value="transfer">{t("transfer")}</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
