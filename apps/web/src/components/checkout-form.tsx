"use client";

/**
 * CheckoutForm — T038, T039, T040
 *
 * Cashier bulk checkout:
 * - Shows awaiting_payment tickets grouped by client; nothing is pre-selected
 *   (M-65 — one client must never be charged for everyone's services)
 * - Line items with snapshotted prices (overrides visible if set)
 * - Payment rows (cash / card / transfer), amounts must sum to total
 * - Confirmation dialog before submitting
 * - Receipt summary on success
 */

import { newUuid } from "@/lib/uuid";
import { notifyDataChanged } from "@/lib/data-events";
import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "@/lib/action-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon, Loader2Icon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
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
  setOverridePrice,
  type AwaitingTicket,
  type CheckoutSummary,
} from "@/app/(protected)/cashier/checkout/actions";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/i18n";

type PaymentMethod = "cash" | "card" | "transfer";
type PaymentLine = { method: PaymentMethod; amount: string };

const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

type ClientGroup = { key: string; clientName: string; tickets: AwaitingTicket[] };

/** Group tickets by payer, keeping the order in which clients first appear. */
function groupByClient(tickets: AwaitingTicket[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const t of tickets) {
    const g = groups.get(t.clientKey);
    if (g) g.tickets.push(t);
    else groups.set(t.clientKey, { key: t.clientKey, clientName: t.clientName, tickets: [t] });
  }
  return [...groups.values()];
}

// Override state per ticket item
type OverrideEdit = { price: string; reason: string; saving: boolean };

export function CheckoutForm({ onClose }: { onClose?: () => void } = {}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const router = useRouter();

  const { data: allTickets = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.tickets.awaitingPayment,
    queryFn: () => unwrap(getAwaitingPaymentTickets()),
    // Always confirm against fresh data when the cashier opens Cobrar.
    staleTime: 0,
  });
  // Opt-in: the cashier ticks the tickets of the client who is paying.
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "cash", amount: "" }]);
  const [isPending, startSubmitTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // overrides[ticketItemId] = { price, reason, saving }
  const [overrideEdits, setOverrideEdits] = useState<Record<string, OverrideEdit>>({});

  // Derive from the fresh list so tickets closed elsewhere drop out of the selection.
  const selected = allTickets.filter((tk) => pickedIds.has(tk.id));
  const selectedIds = new Set(selected.map((tk) => tk.id));
  const groups = groupByClient(allTickets);
  const selectedClients = [...new Set(selected.map((tk) => tk.clientName))];
  const clientList = selectedClients.join(", ");
  const grandTotal = selected.reduce((s, tk) => s + tk.total, 0);
  const paymentSum = payments.reduce((s, p) => s + (parseInt(p.amount, 10) || 0), 0);
  const paymentValid =
    paymentSum === grandTotal && payments.every((p) => parseInt(p.amount, 10) > 0);
  const canSubmit = selected.length > 0 && paymentValid && !isPending;

  async function saveOverride(ticketItemId: string) {
    const edit = overrideEdits[ticketItemId];
    if (!edit) return;
    const price = parseInt(edit.price, 10);
    if (isNaN(price) || price < 0 || !edit.reason.trim()) return;

    setOverrideEdits((prev) => ({
      ...prev,
      [ticketItemId]: { ...prev[ticketItemId], saving: true },
    }));
    const result = await setOverridePrice({
      ticketItemId,
      overridePrice: price,
      overrideReason: edit.reason.trim(),
    });
    if (result.success) {
      // Reload tickets to reflect override
      notifyDataChanged("tickets");
      setOverrideEdits((prev) => {
        const next = { ...prev };
        delete next[ticketItemId];
        return next;
      });
      return;
    }
    toast.error(t("adjustError"), { description: result.error.message });
    setOverrideEdits((prev) => ({
      ...prev,
      [ticketItemId]: { ...prev[ticketItemId], saving: false },
    }));
  }

  function toggleTicket(id: string) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: ClientGroup) {
    const allPicked = group.tickets.every((tk) => selectedIds.has(tk.id));
    setPickedIds((prev) => {
      const next = new Set(prev);
      for (const tk of group.tickets) {
        if (allPicked) next.delete(tk.id);
        else next.add(tk.id);
      }
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
        idempotencyKey: newUuid(),
      });
      if (result.success) {
        setSummary(result.data);
        notifyDataChanged("tickets", "businessDay");
        router.refresh();
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
        <div className="rounded-lg border bg-status-success p-4">
          <p className="font-semibold text-status-success-foreground">{t("successTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("session")}: <span className="font-mono">{summary.sessionId.slice(0, 8)}…</span>
          </p>
        </div>

        {summary.tickets.map((tk) => (
          <div key={tk.id} className="rounded-lg border p-4 space-y-2">
            <p className="font-medium">{tk.clientName}</p>
            {tk.lineItems.map((li) => (
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
                        {formatMoney(li.unitPrice)}
                      </span>
                      {formatMoney(li.overridePrice)}
                    </span>
                  ) : (
                    formatMoney((li.overridePrice ?? li.unitPrice) * li.quantity)
                  )}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t pt-1">
              <span>{t("subtotal")}</span>
              <span className="font-mono tabular-nums">{formatMoney(tk.total)}</span>
            </div>
          </div>
        ))}

        <div className="rounded-lg border p-4 space-y-1">
          <div className="flex justify-between font-bold">
            <span>{t("total")}</span>
            <span className="font-mono tabular-nums">{formatMoney(summary.grandTotal)}</span>
          </div>
          {summary.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span>
                {METHODS.includes(p.method as PaymentMethod)
                  ? t(`method.${p.method as PaymentMethod}`)
                  : p.method}
              </span>
              <span className="font-mono tabular-nums">{formatMoney(p.amount)}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon className="mr-2 size-4" aria-hidden="true" />
            {t("printReceipt")}
          </Button>
          <Button onClick={() => (onClose ? onClose() : router.push("/cashier"))}>
            {tc("back")}
          </Button>
        </div>
      </div>
    );
  }

  if (allTickets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
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

      {/* Ticket selection — grouped by client, nothing pre-selected (M-65) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{t("ticketsHeading")}</h2>
          <p className="text-xs text-muted-foreground">{t("selectHint")}</p>
        </div>
        {groups.map((group) => {
          const pickedInGroup = group.tickets.filter((tk) => selectedIds.has(tk.id)).length;
          const allPicked = pickedInGroup === group.tickets.length;
          return (
            <div key={group.key} className="rounded-lg border">
              <label className="flex cursor-pointer items-center gap-3 rounded-t-lg bg-muted/40 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allPicked}
                  ref={(el) => {
                    if (el) el.indeterminate = pickedInGroup > 0 && !allPicked;
                  }}
                  onChange={() => toggleGroup(group)}
                  aria-label={t("selectClient", { client: group.clientName })}
                  className="size-4"
                />
                <span className="flex-1 text-sm font-medium">{group.clientName}</span>
                <span className="font-mono tabular-nums text-xs text-muted-foreground">
                  {formatMoney(group.tickets.reduce((s, tk) => s + tk.total, 0))}
                </span>
              </label>
              {group.tickets.map((tk) => (
                <label
                  key={tk.id}
                  className="flex cursor-pointer items-start gap-3 border-t px-3 py-2.5 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tk.id)}
                    onChange={() => toggleTicket(tk.id)}
                    className="mt-0.5 size-4"
                  />
                  <div className="flex-1 min-w-0">
                    {tk.lineItems.map((li) => {
                      const edit = overrideEdits[li.ticketItemId];
                      const effectivePrice = li.overridePrice ?? li.unitPrice;
                      return (
                        <div key={li.ticketItemId} className="mt-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm">
                              {li.serviceName}
                              {li.variantName &&
                              li.variantName !== "Estándar" &&
                              li.variantName !== "Standard"
                                ? ` — ${li.variantName}`
                                : ""}
                              {li.quantity > 1 ? ` ×${li.quantity}` : ""}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              {li.overridePrice !== null && (
                                <span className="text-xs line-through text-muted-foreground">
                                  {formatMoney(li.unitPrice)}
                                </span>
                              )}
                              <span className="font-mono tabular-nums text-xs">
                                {formatMoney(effectivePrice * li.quantity)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setOverrideEdits((prev) =>
                                    prev[li.ticketItemId]
                                      ? (() => {
                                          const n = { ...prev };
                                          delete n[li.ticketItemId];
                                          return n;
                                        })()
                                      : {
                                          ...prev,
                                          [li.ticketItemId]: {
                                            price: String(li.overridePrice ?? li.unitPrice),
                                            reason: "",
                                            saving: false,
                                          },
                                        },
                                  )
                                }
                                className="text-xs text-muted-foreground underline hover:text-foreground"
                              >
                                {t("adjust")}
                              </button>
                            </div>
                          </div>
                          {edit && (
                            <div className="mt-1 flex gap-1">
                              <Input
                                type="number"
                                min={0}
                                value={edit.price}
                                onChange={(e) =>
                                  setOverrideEdits((prev) => ({
                                    ...prev,
                                    [li.ticketItemId]: {
                                      ...prev[li.ticketItemId],
                                      price: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={t("adjustPrice")}
                                aria-label={t("adjustPrice")}
                                className="w-28 h-7 text-xs"
                              />
                              <Input
                                value={edit.reason}
                                onChange={(e) =>
                                  setOverrideEdits((prev) => ({
                                    ...prev,
                                    [li.ticketItemId]: {
                                      ...prev[li.ticketItemId],
                                      reason: e.target.value,
                                    },
                                  }))
                                }
                                placeholder={t("adjustReason")}
                                aria-label={t("adjustReason")}
                                className="flex-1 h-7 text-xs"
                              />
                              <Button
                                type="button"
                                size="xs"
                                disabled={
                                  edit.saving ||
                                  !edit.reason.trim() ||
                                  isNaN(parseInt(edit.price, 10))
                                }
                                onClick={() => saveOverride(li.ticketItemId)}
                              >
                                {edit.saving && (
                                  <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
                                )}
                                {t("save")}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="font-mono tabular-nums text-sm shrink-0">
                    {formatMoney(tk.total)}
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </section>

      {selectedClients.length > 1 && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-status-attention-foreground/30 bg-status-attention px-3 py-2 text-sm text-status-attention-foreground"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("multiClientWarning", { count: selectedClients.length, clients: clientList })}
        </p>
      )}

      {/* Total */}
      <div className="flex justify-between rounded-lg border bg-muted/40 px-4 py-3 font-semibold">
        <span>{t("totalToCharge")}</span>
        <span className="font-mono tabular-nums">{formatMoney(grandTotal)}</span>
      </div>

      {/* Payments */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t("paymentMethods")}</h2>
        {payments.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <NativeSelect
              value={p.method}
              onChange={(e) => updatePayment(i, "method", e.target.value)}
              selectClassName="text-sm"
              aria-label={t("paymentMethod")}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method.${m}`)}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="number"
              min={1}
              value={p.amount}
              onChange={(e) => updatePayment(i, "amount", e.target.value)}
              placeholder={t("amount")}
              className="w-36"
              aria-label={t("amount")}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRemainingAmount(i)}
              className="text-xs text-muted-foreground"
            >
              {t("remaining")}
            </Button>
            {payments.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removePaymentRow(i)}
                aria-label={t("removeRow")}
              >
                <Trash2Icon className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
        {paymentSum !== grandTotal && grandTotal > 0 && (
          <p className="text-xs text-destructive">
            {t("unassigned", { amount: formatMoney(grandTotal - paymentSum) })}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={addPaymentRow}>
          <PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
          {t("addMethod")}
        </Button>
      </section>

      {/* Submit */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
          {t("submit")}
        </Button>
        {selected.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("nothingSelected")}</p>
        )}
        <Button variant="outline" onClick={() => (onClose ? onClose() : router.push("/cashier"))}>
          {tc("cancel")}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("confirmTitle", { amount: formatMoney(grandTotal), clients: clientList })}
            </DialogTitle>
          </DialogHeader>
          {selectedClients.length > 1 && (
            <p className="text-sm font-medium text-status-attention-foreground">
              {t("multiClientWarning", { count: selectedClients.length, clients: clientList })}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("confirmDescription", { count: selected.length })}
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
