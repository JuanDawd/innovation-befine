"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { PlusIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLargeOrder, type ClientOption } from "./actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";

type Props = {
  clients: ClientOption[];
  clothPieces: ClothPieceRow[];
  canOverridePrice: boolean;
};

type OrderLine = {
  key: number;
  clothPieceId: string;
  clothPieceVariantId: string;
  quantity: number;
  unitPrice: number;
};

export function CreateLargeOrderForm({ clients, clothPieces }: Props) {
  const t = useTranslations("largeOrders");
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [withDeposit, setWithDeposit] = useState(false);

  const [lines, setLines] = useState<OrderLine[]>([
    { key: 0, clothPieceId: "", clothPieceVariantId: "", quantity: 1, unitPrice: 0 },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const grandTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: nextKey, clothPieceId: "", clothPieceVariantId: "", quantity: 1, unitPrice: 0 },
    ]);
    setNextKey((k) => k + 1);
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key));
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

    const fd = new FormData(e.currentTarget);
    const depositAmountRaw = fd.get("initialDepositAmount") as string;
    const depositAmount = depositAmountRaw ? parseInt(depositAmountRaw, 10) : undefined;
    const rawTotalPrice = parseInt(fd.get("totalPrice") as string, 10);

    const input = {
      clientId: fd.get("clientId") as string,
      description: fd.get("description") as string,
      totalPrice: rawTotalPrice,
      estimatedDeliveryAt: (fd.get("estimatedDeliveryAt") as string)
        ? `${fd.get("estimatedDeliveryAt") as string}:00-05:00`
        : undefined,
      notes: (fd.get("notes") as string) || undefined,
      initialDepositAmount: withDeposit ? depositAmount : undefined,
      initialDepositMethod: withDeposit
        ? (fd.get("initialDepositMethod") as "cash" | "card" | "transfer")
        : undefined,
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
      router.push(`/large-orders/${res.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ─── Items from catalogue ─── */}
      {clothPieces.length > 0 && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">
            {t("items")}
            <span className="text-muted-foreground font-normal text-xs ml-2">(opcional)</span>
          </p>

          {lines.map((line) => {
            const piece = clothPieces.find((p) => p.id === line.clothPieceId);
            const activeVariants = piece?.variants.filter((v) => v.isActive) ?? [];
            const lineTotal = line.unitPrice * line.quantity;

            return (
              <div key={line.key} className="rounded-md border bg-muted/30 p-3 space-y-2">
                {/* Piece + variant row */}
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <select
                      aria-label={t("selectPiece")}
                      value={line.clothPieceId}
                      onChange={(e) => updateLine(line.key, { clothPieceId: e.target.value })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:border-ring"
                    >
                      <option value="">{t("selectPiece")}</option>
                      {clothPieces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-0">
                    <select
                      aria-label={t("selectVariant")}
                      value={line.clothPieceVariantId}
                      onChange={(e) =>
                        updateLine(line.key, { clothPieceVariantId: e.target.value })
                      }
                      disabled={!line.clothPieceId || activeVariants.length === 0}
                      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:border-ring disabled:opacity-50"
                    >
                      <option value="">
                        {line.clothPieceId && activeVariants.length === 0
                          ? t("noVariants")
                          : t("selectVariant")}
                      </option>
                      {activeVariants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    aria-label={t("removeItem")}
                    className="mt-auto mb-0.5 p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>

                {/* Qty + unit price + line total */}
                <div className="flex gap-2 items-end">
                  <div className="w-20 space-y-1">
                    <label className="text-xs text-muted-foreground">{t("quantity")}</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, {
                          quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{t("unitPrice")}</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line.key, { unitPrice: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                    />
                  </div>
                  {lineTotal > 0 && (
                    <div className="text-sm font-mono font-semibold text-right pb-0.5 shrink-0">
                      ${lineTotal.toLocaleString("es-CO")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            className="self-start"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            {t("addItem")}
          </Button>

          {grandTotal > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("grandTotal")}</span>
              <span className="font-mono font-semibold">${grandTotal.toLocaleString("es-CO")}</span>
            </div>
          )}
        </div>
      )}

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

      {/* Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">
          {t("description")} <span className="text-destructive">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          maxLength={500}
          rows={3}
          placeholder={t("descriptionPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
        />
        {fieldErrors.description && (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        )}
      </div>

      {/* Total price — pre-filled from computed grand total */}
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
          key={grandTotal || "manual"}
          defaultValue={grandTotal > 0 ? grandTotal : undefined}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
        />
        {fieldErrors.totalPrice && (
          <p className="text-xs text-destructive">{fieldErrors.totalPrice}</p>
        )}
      </div>

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
        {isPending ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
