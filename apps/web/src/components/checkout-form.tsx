"use client";

/**
 * CheckoutForm — T038, T039, T040
 *
 * Cashier batch checkout:
 * - Shows awaiting_payment tickets, pre-selects all for same client
 * - Line items with snapshotted prices (overrides visible if set)
 * - Payment rows (cash / card / transfer), amounts must sum to total
 * - Confirmation dialog before submitting
 * - Receipt summary on success
 */

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon, Loader2Icon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  getAwaitingPaymentTickets,
  processCheckout,
  type CheckoutTicket,
  type CheckoutSummary,
} from "@/app/(protected)/cashier/checkout/actions";

type PaymentLine = { method: "cash" | "card" | "transfer"; amount: string };

const METHOD_LABELS: Record<"cash" | "card" | "transfer", string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

export function CheckoutForm() {
  const tc = useTranslations("common");
  const router = useRouter();

  const [allTickets, setAllTickets] = useState<CheckoutTicket[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "cash", amount: "" }]);
  const [isLoading, startLoadTransition] = useTransition();
  const [isPending, startSubmitTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startLoadTransition(async () => {
      const res = await getAwaitingPaymentTickets();
      if (res.success) {
        setAllTickets(res.data);
        setSelectedIds(new Set(res.data.map((t) => t.id)));
      }
    });
  }, []);

  const selected = allTickets.filter((t) => selectedIds.has(t.id));
  const grandTotal = selected.reduce((s, t) => s + t.total, 0);
  const paymentSum = payments.reduce((s, p) => s + (parseInt(p.amount, 10) || 0), 0);
  const paymentValid =
    paymentSum === grandTotal && payments.every((p) => parseInt(p.amount, 10) > 0);
  const canSubmit = selected.length > 0 && paymentValid && !isPending;

  function toggleTicket(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addPaymentRow() {
    setPayments((prev) => [...prev, { method: "cash", amount: "" }]);
  }

  function removePaymentRow(i: number) {
    setPayments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updatePayment(i: number, field: keyof PaymentLine, value: string) {
    setPayments((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  function setRemainingAmount(i: number) {
    const otherSum = payments.reduce(
      (s, p, idx) => (idx === i ? s : s + (parseInt(p.amount, 10) || 0)),
      0,
    );
    const remaining = grandTotal - otherSum;
    if (remaining > 0) updatePayment(i, "amount", String(remaining));
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    setError(null);
    startSubmitTransition(async () => {
      const result = await processCheckout({
        ticketIds: [...selectedIds],
        payments: payments.map((p) => ({ method: p.method, amount: parseInt(p.amount, 10) })),
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.success) {
        setSummary(result.data);
      } else {
        setError(result.error.message);
      }
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Receipt / summary view
  if (summary) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
          <p className="font-semibold text-green-700 dark:text-green-400">
            Pago registrado correctamente
          </p>
          <p className="text-sm text-muted-foreground">
            Sesión: <span className="font-mono">{summary.sessionId.slice(0, 8)}…</span>
          </p>
        </div>

        {summary.tickets.map((t) => (
          <div key={t.id} className="rounded-lg border p-4 space-y-2">
            <p className="font-medium">{t.clientName}</p>
            {t.lineItems.map((li) => (
              <div key={li.ticketItemId} className="flex justify-between text-sm">
                <span>
                  {li.serviceName}
                  {li.variantName && li.variantName !== "Estándar" && li.variantName !== "Standard"
                    ? ` — ${li.variantName}`
                    : ""}
                  {li.quantity > 1 ? ` ×${li.quantity}` : ""}
                </span>
                <span className="font-mono tabular-nums">
                  {li.overridePrice !== null ? (
                    <span>
                      <span className="line-through text-muted-foreground mr-1">
                        {formatCOP(li.unitPrice)}
                      </span>
                      {formatCOP(li.overridePrice)}
                    </span>
                  ) : (
                    formatCOP((li.overridePrice ?? li.unitPrice) * li.quantity)
                  )}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t pt-1">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCOP(t.total)}</span>
            </div>
          </div>
        ))}

        <div className="rounded-lg border p-4 space-y-1">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatCOP(summary.grandTotal)}</span>
          </div>
          {summary.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span>{METHOD_LABELS[p.method as keyof typeof METHOD_LABELS] ?? p.method}</span>
              <span className="font-mono tabular-nums">{formatCOP(p.amount)}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon className="mr-2 size-4" />
            Imprimir recibo
          </Button>
          <Button onClick={() => router.push("/cashier")}>{tc("back")}</Button>
        </div>
      </div>
    );
  }

  if (allTickets.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay tickets pendientes de pago.</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Ticket selection */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Tickets seleccionados</h2>
        {allTickets.map((t) => (
          <label
            key={t.id}
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(t.id)}
              onChange={() => toggleTicket(t.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.clientName}</p>
              {t.lineItems.map((li) => (
                <p key={li.ticketItemId} className="text-xs text-muted-foreground">
                  {li.serviceName}
                  {li.variantName && li.variantName !== "Estándar" && li.variantName !== "Standard"
                    ? ` — ${li.variantName}`
                    : ""}
                  {li.quantity > 1 ? ` ×${li.quantity}` : ""}
                  {li.overridePrice !== null ? ` (precio ajustado)` : ""}
                </p>
              ))}
            </div>
            <span className="font-mono tabular-nums text-sm shrink-0">{formatCOP(t.total)}</span>
          </label>
        ))}
      </section>

      {/* Total */}
      <div className="flex justify-between rounded-lg border bg-muted/40 px-4 py-3 font-semibold">
        <span>Total a cobrar</span>
        <span className="font-mono tabular-nums">{formatCOP(grandTotal)}</span>
      </div>

      {/* Payments */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Métodos de pago</h2>
        {payments.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={p.method}
              onChange={(e) => updatePayment(i, "method", e.target.value)}
              className="flex h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Método de pago"
            >
              {Object.entries(METHOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              value={p.amount}
              onChange={(e) => updatePayment(i, "amount", e.target.value)}
              placeholder="Monto"
              className="w-36"
              aria-label="Monto"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRemainingAmount(i)}
              className="text-xs text-muted-foreground"
            >
              Restante
            </Button>
            {payments.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removePaymentRow(i)}
                aria-label="Eliminar fila"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        {paymentSum !== grandTotal && grandTotal > 0 && (
          <p className="text-xs text-destructive">
            Faltan {formatCOP(grandTotal - paymentSum)} por asignar
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={addPaymentRow}>
          <PlusIcon className="mr-1 size-3.5" />
          Agregar método
        </Button>
      </section>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          Confirmar cobro
        </Button>
        <Button variant="outline" onClick={() => router.push("/cashier")}>
          {tc("cancel")}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Confirmar cobro de {formatCOP(grandTotal)}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se cerrarán {selected.length} ticket{selected.length !== 1 ? "s" : ""} y se registrará
            el pago. Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
