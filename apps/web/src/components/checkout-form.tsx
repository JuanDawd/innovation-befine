"use client";

/**
 * CheckoutForm — T038, T039, T040
 *
 * Cashier bulk checkout:
 * - Shows awaiting_payment tickets grouped by client; nothing is pre-selected
 *   (M-65 — one client must never be charged for everyone's services), except
 *   when opened from a board card: `preselectTicketId` selects that ticket's
 *   client — the cashier picked that payer explicitly.
 * - Line items with snapshotted prices (overrides visible if set)
 * - Payment rows (cash / card / transfer), amounts must sum to total
 * - Confirmation dialog before submitting
 * - Receipt summary on success
 */

import { newUuid } from "@/lib/uuid";
import { notifyDataChanged } from "@/lib/data-events";
import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon, Loader2Icon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amountDue } from "@/lib/checkout-due";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  processCheckout,
  setOverridePrice,
  type AwaitingTicket,
  type CheckoutSummary,
} from "@/app/(protected)/cashier/checkout/actions";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/i18n";
import { fetchQuery } from "@/lib/action-query";

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

export function CheckoutForm({
  onClose,
  preselectTicketId,
}: { onClose?: () => void; preselectTicketId?: string } = {}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: allTickets = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.tickets.awaitingPayment,
    queryFn: () => fetchQuery("awaitingPaymentTickets"),
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
  // Board card → select that ticket's client once the list arrives
  // (adjust-state-during-render; runs once per ticket id).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (preselectTicketId && seededFor !== preselectTicketId && !isLoading) {
    setSeededFor(preselectTicketId);
    const payer = allTickets.find((tk) => tk.id === preselectTicketId)?.clientKey;
    if (payer) {
      setPickedIds(new Set(allTickets.filter((tk) => tk.clientKey === payer).map((tk) => tk.id)));
    }
  }
  // overrides[ticketItemId] = { price, reason, saving }
  const [overrideEdits, setOverrideEdits] = useState<Record<string, OverrideEdit>>({});

  // Derive from the fresh list so tickets closed elsewhere drop out of the selection.
  const selected = allTickets.filter((tk) => pickedIds.has(tk.id));
  const selectedIds = new Set(selected.map((tk) => tk.id));
  const groups = groupByClient(allTickets);
  const selectedClients = [...new Set(selected.map((tk) => tk.clientName))];
  const clientList = selectedClients.join(", ");
  // M-80: reopened tickets were already paid — collect (or refund) only the difference
  const due = amountDue(selected);
  const isRefund = due < 0;
  const nothingDue = selected.length > 0 && due === 0;
  const prepaidTotal = selected.reduce((s, tk) => s + tk.prepaid, 0);
  // Amounts are typed as positive numbers; a refund is sent negative
  const grandTotal = Math.abs(due);
  const paymentSum = payments.reduce((s, p) => s + (parseInt(p.amount, 10) || 0), 0);
  const cashAmount = payments
    .filter((p) => p.method === "cash")
    .reduce((s, p) => s + (parseInt(p.amount, 10) || 0), 0);
  const [cashReceived, setCashReceived] = useState("");
  const change = (parseInt(cashReceived, 10) || 0) - cashAmount;
  const paymentValid =
    nothingDue ||
    (paymentSum === grandTotal &&
      grandTotal > 0 &&
      payments.every((p) => parseInt(p.amount, 10) > 0));
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
      toast.success(t("adjustSuccess", { price: formatMoney(price) }));
      // M-70: show the new price and total now; the refetch confirms it.
      queryClient.setQueryData<AwaitingTicket[]>(queryKeys.tickets.awaitingPayment, (prev) =>
        prev?.map((tk) => {
          if (!tk.lineItems.some((li) => li.ticketItemId === ticketItemId)) return tk;
          const lineItems = tk.lineItems.map((li) =>
            li.ticketItemId === ticketItemId ? { ...li, overridePrice: price } : li,
          );
          const total = lineItems.reduce(
            (sum, li) => sum + (li.overridePrice ?? li.unitPrice) * li.quantity,
            0,
          );
          return { ...tk, lineItems, total };
        }),
      );
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
        payments: nothingDue
          ? []
          : payments.map((p) => ({
              method: p.method,
              amount: (isRefund ? -1 : 1) * parseInt(p.amount, 10),
            })),
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
          {summary.prepaid > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("paidBefore")}</span>
              <span className="font-mono tabular-nums">{formatMoney(summary.prepaid)}</span>
            </div>
          )}
          {summary.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm text-muted-foreground">
              <span>
                {p.amount < 0 && `${t("refund")} · `}
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
                    aria-label={t("selectTicket", {
                      services: tk.lineItems.map((li) => li.serviceName).join(", "),
                      amount: formatMoney(tk.total),
                    })}
                    className="mt-0.5 size-4"
                  />
                  <div className="flex-1 min-w-0">
                    {tk.lineItems.map((li) => {
                      const edit = overrideEdits[li.ticketItemId];
                      const effectivePrice = li.overridePrice ?? li.unitPrice;
                      return (
                        <div key={li.ticketItemId} className="mt-0.5 first:mt-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 text-sm">
                              {li.serviceName}
                              {li.variantName &&
                              li.variantName !== "Estándar" &&
                              li.variantName !== "Standard"
                                ? ` — ${li.variantName}`
                                : ""}
                              {li.quantity > 1 ? ` ×${li.quantity}` : ""}
                            </p>
                            {/* Item price only when it differs from the ticket total beside it */}
                            {(tk.lineItems.length > 1 || li.overridePrice !== null) && (
                              <span className="flex shrink-0 items-baseline gap-1">
                                {li.overridePrice !== null && (
                                  <span className="text-xs text-muted-foreground line-through">
                                    {formatMoney(li.unitPrice)}
                                  </span>
                                )}
                                <span className="font-mono text-xs tabular-nums">
                                  {formatMoney(effectivePrice * li.quantity)}
                                </span>
                              </span>
                            )}
                          </div>
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
                            className="-ml-1 rounded px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
                          >
                            {t("adjust")}
                          </button>
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
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-medium tabular-nums">
                      {formatMoney(tk.total)}
                    </span>
                    {tk.prepaid > 0 && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {t("alreadyPaid", { amount: formatMoney(tk.prepaid) })}
                      </span>
                    )}
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

      {/* Total — what this checkout moves */}
      <div className="space-y-1 rounded-lg border bg-muted/40 px-4 py-3">
        {prepaidTotal > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("paidBefore")}</span>
            <span className="font-mono tabular-nums">{formatMoney(prepaidTotal)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>{isRefund ? t("totalToRefund") : t("totalToCharge")}</span>
          <span className="font-mono tabular-nums">{formatMoney(grandTotal)}</span>
        </div>
        {nothingDue && <p className="text-sm text-muted-foreground">{t("nothingDue")}</p>}
      </div>

      {/* Payments — none when a reopened ticket kept its price */}
      <section className={`space-y-2 ${nothingDue ? "hidden" : ""}`}>
        <h2 className="text-sm font-semibold">
          {isRefund ? t("refundMethods") : t("paymentMethods")}
        </h2>
        {payments.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              className="min-w-[10.5rem]"
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
            <MoneyInput
              value={p.amount}
              onValueChange={(digits) => updatePayment(i, "amount", digits)}
              placeholder={t("amount")}
              className="w-36"
              aria-label={t("amountFor", { method: t(`method.${p.method}`) })}
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
        <p className="text-xs text-destructive" aria-live="polite">
          {paymentSum !== grandTotal && grandTotal > 0
            ? t("unassigned", { amount: formatMoney(grandTotal - paymentSum) })
            : ""}
        </p>
        {/* Cash: what the client handed over, and the change to give back */}
        {cashAmount > 0 && !isRefund && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="cash-received" className="text-sm text-muted-foreground">
              {t("cashReceived")}
            </label>
            <MoneyInput
              id="cash-received"
              value={cashReceived}
              onValueChange={setCashReceived}
              className="w-36"
            />
            <p className="text-sm tabular-nums" aria-live="polite">
              {cashReceived !== "" &&
                (change >= 0 ? (
                  <>
                    {t("change")}{" "}
                    <span className="font-mono font-semibold">{formatMoney(change)}</span>
                  </>
                ) : (
                  <span className="text-destructive">
                    {t("cashShort", { amount: formatMoney(-change) })}
                  </span>
                ))}
            </p>
          </div>
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
        <Button variant="outline" onClick={() => (onClose ? onClose() : router.push("/cashier"))}>
          {tc("cancel")}
        </Button>
        {selected.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("nothingSelected")}</p>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {nothingDue
                ? t("confirmNoChargeTitle", { clients: clientList })
                : isRefund
                  ? t("confirmRefundTitle", {
                      amount: formatMoney(grandTotal),
                      clients: clientList,
                    })
                  : t("confirmTitle", { amount: formatMoney(grandTotal), clients: clientList })}
            </DialogTitle>
          </DialogHeader>
          {selectedClients.length > 1 && (
            <p className="text-sm font-medium text-status-attention-foreground">
              {t("multiClientWarning", { count: selectedClients.length, clients: clientList })}
            </p>
          )}
          {/* Restate how it is being paid — the moment a wrong method gets caught */}
          <ul className="space-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            {payments
              .filter((p) => (parseInt(p.amount, 10) || 0) > 0)
              .map((p, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{t(`method.${p.method}`)}</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(parseInt(p.amount, 10))}
                  </span>
                </li>
              ))}
            {cashReceived !== "" && change > 0 && (
              <li className="flex justify-between gap-4 text-muted-foreground">
                <span>{t("change")}</span>
                <span className="font-mono tabular-nums">{formatMoney(change)}</span>
              </li>
            )}
          </ul>
          <p className="text-sm text-muted-foreground">
            {isRefund
              ? t("confirmRefundDescription", { count: selected.length })
              : t("confirmDescription", { count: selected.length })}
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
