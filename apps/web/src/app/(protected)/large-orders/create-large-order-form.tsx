"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLargeOrder, type ClientOption } from "./actions";

type Props = { clients: ClientOption[] };

export function CreateLargeOrderForm({ clients }: Props) {
  const t = useTranslations("largeOrders");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [withDeposit, setWithDeposit] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const depositAmountRaw = fd.get("initialDepositAmount") as string;
    const depositAmount = depositAmountRaw ? parseInt(depositAmountRaw, 10) : undefined;

    const input = {
      clientId: fd.get("clientId") as string,
      description: fd.get("description") as string,
      totalPrice: parseInt(fd.get("totalPrice") as string, 10),
      estimatedDeliveryAt: (fd.get("estimatedDeliveryAt") as string) || undefined,
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
        }
        return;
      }
      router.push(`/large-orders/${res.data.id}`);
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

      {/* Total price */}
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
