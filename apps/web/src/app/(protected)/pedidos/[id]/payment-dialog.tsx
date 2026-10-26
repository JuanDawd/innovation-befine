"use client";

/**
 * Registrar pago / Devolver — T127 (spec §3.5)
 *
 * A payment defaults to the balance; a refund to what is owed back. With no
 * business day open the payment is still taken and recorded after hours.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BanknoteIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyDataChanged } from "@/lib/data-events";
import { newUuid } from "@/lib/uuid";
import { formatMoney } from "@/i18n";
import { checkPedidoPayment } from "@/lib/pedido-payments";
import { recordPedidoPayment } from "../payment-actions";

export function PaymentDialog({
  pedidoId,
  kind,
  cancelled,
  paid,
  balance,
  saldoAFavor,
  dayOpen,
}: {
  pedidoId: string;
  kind: "payment" | "refund";
  cancelled: boolean;
  paid: number;
  balance: number;
  saldoAFavor: number;
  dayOpen: boolean;
}) {
  const t = useTranslations("pedidos.payment");
  const tc = useTranslations("common");
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [note, setNote] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const suggested = kind === "payment" ? balance : cancelled ? paid : saldoAFavor;

  const problem = amount
    ? checkPedidoPayment({
        kind,
        amount: Number(amount),
        destination: "client",
        cancelled,
        paid,
        balance,
        saldoAFavor,
        note: kind === "refund" ? note || null : null,
      })
    : null;
  // The refund note is asked for below; only flag it once they try to save.
  const shown =
    problem && !(kind === "refund" && !note.trim() && /motivo/.test(problem)) ? problem : null;

  function openDialog() {
    setAmount(suggested > 0 ? String(suggested) : "");
    setMethod("cash");
    setNote("");
    setError(null);
    setKey(newUuid());
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordPedidoPayment(pedidoId, {
        kind,
        amount: Number(amount),
        method,
        note: note || undefined,
        idempotencyKey: key,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      toast.success(
        res.data.afterHours
          ? t("savedAfterHours", { amount: formatMoney(Number(amount)) })
          : kind === "payment"
            ? t("saved", { amount: formatMoney(Number(amount)) })
            : t("refunded", { amount: formatMoney(Number(amount)) }),
      );
      notifyDataChanged("pedidos");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant={kind === "payment" ? "default" : "outline"} onClick={openDialog}>
        {kind === "payment" ? (
          <BanknoteIcon className="size-4" aria-hidden="true" />
        ) : (
          <Undo2Icon className="size-4" aria-hidden="true" />
        )}
        {kind === "payment" ? t("pay") : t("refund")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{kind === "payment" ? t("payTitle") : t("refundTitle")}</DialogTitle>
            <DialogDescription>
              {kind === "payment"
                ? t("payDescription", { balance: formatMoney(balance) })
                : t("refundDescription", { amount: formatMoney(suggested) })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!dayOpen && (
              <p className="rounded-lg border border-status-attention-foreground/30 bg-status-attention/40 px-3 py-2 text-sm">
                {t("afterHoursWarning")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-amount`} className="text-sm font-medium">
                  {t("amount")}
                </label>
                <MoneyInput
                  id={`${uid}-amount`}
                  value={amount}
                  onValueChange={setAmount}
                  aria-invalid={!!shown}
                  aria-describedby={shown ? `${uid}-problem` : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-method`} className="text-sm font-medium">
                  {t("method")}
                </label>
                <NativeSelect
                  id={`${uid}-method`}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as "cash" | "card" | "transfer")}
                  className="w-full"
                >
                  <option value="cash">{t("methods.cash")}</option>
                  <option value="card">{t("methods.card")}</option>
                  <option value="transfer">{t("methods.transfer")}</option>
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-note`} className="text-sm font-medium">
                {kind === "refund" ? t("refundReason") : t("note")}{" "}
                {kind === "payment" && (
                  <span className="text-muted-foreground">{tc("optional")}</span>
                )}
              </label>
              <Input
                id={`${uid}-note`}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder={kind === "refund" ? t("refundReasonPlaceholder") : undefined}
              />
            </div>
            {shown && (
              <p id={`${uid}-problem`} className="text-sm text-destructive">
                {shown}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button onClick={submit} disabled={isPending || !amount || !!problem}>
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {kind === "payment"
                ? t("confirmPay", { amount: amount ? formatMoney(Number(amount)) : "" })
                : t("confirmRefund", { amount: amount ? formatMoney(Number(amount)) : "" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
