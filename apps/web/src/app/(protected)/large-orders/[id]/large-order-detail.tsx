"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PencilIcon, CheckIcon, XIcon, AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  transitionLargeOrder,
  editLargeOrder,
  recordLargeOrderPayment,
  type LargeOrderRow,
  type OrderBatchSummary,
} from "../actions";

type Props = {
  order: LargeOrderRow;
  batches: OrderBatchSummary[];
};

const ACTIONS_BY_STATUS: Record<string, string[]> = {
  pending: ["start_production", "cancel"],
  in_production: ["mark_ready", "cancel"],
  ready: ["mark_delivered", "cancel"],
  delivered: ["mark_paid", "cancel"],
};

export function LargeOrderDetail({ order: initialOrder, batches }: Props) {
  const t = useTranslations("largeOrders");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const order = initialOrder;
  const [editing, setEditing] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [acknowledgedDeposits, setAcknowledgedDeposits] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDeposits = order.totalPaid > 0;

  // Edit form state
  const [editDescription, setEditDescription] = useState(order.description);
  const [editTotalPrice, setEditTotalPrice] = useState(String(order.totalPrice));
  const [editEta, setEditEta] = useState(
    order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toISOString().slice(0, 16) : "",
  );
  const [editNotes, setEditNotes] = useState(order.notes ?? "");

  function transition(action: string, cancellationReason?: string, ackDeposits?: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await transitionLargeOrder({
        orderId: order.id,
        action: action as Parameters<typeof transitionLargeOrder>[0] extends { action: infer A }
          ? A
          : string,
        cancellationReason,
        acknowledgedDeposits: ackDeposits,
        version: order.version,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setCancelDialogOpen(false);
      setCancelReason("");
      setAcknowledgedDeposits(false);
      router.refresh();
    });
  }

  function confirmCancel() {
    if (!cancelReason.trim()) {
      setError(t("cancellationReasonRequired"));
      return;
    }
    transition("cancel", cancelReason.trim(), hasDeposits ? acknowledgedDeposits : undefined);
  }

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const res = await editLargeOrder(order.id, {
        description: editDescription,
        totalPrice: parseInt(editTotalPrice, 10),
        estimatedDeliveryAt: editEta ? `${editEta}:00-05:00` : null,
        notes: editNotes || null,
        version: order.version,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function recordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await recordLargeOrderPayment({
        orderId: order.id,
        amount: parseInt(fd.get("amount") as string, 10),
        method: fd.get("method") as "cash" | "card" | "transfer",
        paidAt: (fd.get("paidAt") as string) ? `${fd.get("paidAt") as string}:00-05:00` : undefined,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setShowPaymentForm(false);
      router.refresh();
    });
  }

  const actions = ACTIONS_BY_STATUS[order.status] ?? [];
  const isTerminal = order.status === "paid_in_full" || order.status === "cancelled";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{order.clientName}</h1>
          <StatusBadge status={order.status} />
        </div>
        {!isTerminal && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon className="h-3.5 w-3.5 mr-1" />
            {t("editOrder")}
          </Button>
        )}
      </div>

      {/* Edit form */}
      {editing ? (
        <div className="border rounded-md p-4 space-y-4 bg-muted/20">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("description")}</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("totalPrice")}</label>
            <input
              type="number"
              min={1}
              value={editTotalPrice}
              onChange={(e) => setEditTotalPrice(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("estimatedDelivery")}</label>
            <input
              type="datetime-local"
              value={editEta}
              onChange={(e) => setEditEta(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("notes")}</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-ring resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={saveEdit}>
              {isPending ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <CheckIcon className="h-3.5 w-3.5 mr-1" />
              )}
              {t("submit")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <XIcon className="h-3.5 w-3.5 mr-1" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        /* Order summary */
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t("description")}</dt>
          <dd className="font-medium">{order.description}</dd>

          <dt className="text-muted-foreground">{t("totalPrice")}</dt>
          <dd className="font-mono tabular-nums">${order.totalPrice.toLocaleString("es-CO")}</dd>

          <dt className="text-muted-foreground">{t("colPaid")}</dt>
          <dd className="font-mono tabular-nums text-green-600 dark:text-green-400">
            ${order.totalPaid.toLocaleString("es-CO")}
          </dd>

          <dt className="text-muted-foreground">{t("balanceDue")}</dt>
          <dd
            className={`font-mono tabular-nums font-semibold ${order.balanceDue > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}
          >
            ${order.balanceDue.toLocaleString("es-CO")}
          </dd>

          {order.estimatedDeliveryAt && (
            <>
              <dt className="text-muted-foreground">{t("estimatedDelivery")}</dt>
              <dd>
                {new Date(order.estimatedDeliveryAt).toLocaleDateString("es-CO", {
                  timeZone: "America/Bogota",
                  dateStyle: "medium",
                })}
              </dd>
            </>
          )}

          {order.notes && (
            <>
              <dt className="text-muted-foreground">{t("notes")}</dt>
              <dd className="text-muted-foreground">{order.notes}</dd>
            </>
          )}

          {order.cancellationReason && (
            <>
              <dt className="text-muted-foreground">{t("cancellationReason")}</dt>
              <dd className="text-destructive">{order.cancellationReason}</dd>
            </>
          )}
        </dl>
      )}

      {/* Status actions */}
      {!isTerminal && actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("colActions")}</p>
          <div className="flex flex-wrap gap-2">
            {actions
              .filter((a) => a !== "cancel")
              .map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => transition(action)}
                >
                  {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {t(`action_${action}` as Parameters<typeof t>[0])}
                </Button>
              ))}
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setError(null);
                setCancelDialogOpen(true);
              }}
            >
              <XIcon className="h-3.5 w-3.5 mr-1" />
              {t("action_cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!isPending) {
            setCancelDialogOpen(open);
            if (!open) {
              setCancelReason("");
              setAcknowledgedDeposits(false);
              setError(null);
            }
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/10 p-2">
                <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-destructive">{t("cancelTitle")}</DialogTitle>
                <DialogDescription>{t("cancelDescription")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {hasDeposits && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  {t("cancelDepositWarning")}
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  {t("cancelDepositAmount", {
                    amount: `$${order.totalPaid.toLocaleString("es-CO")}`,
                  })}
                </p>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={acknowledgedDeposits}
                    onChange={(e) => setAcknowledgedDeposits(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-amber-800 dark:text-amber-300 font-medium">
                    {t("cancelDepositAck")}
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="cancelReason">
                {t("cancellationReason")} <span className="text-destructive">*</span>
              </label>
              <input
                id="cancelReason"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                placeholder={t("cancellationReasonPlaceholder")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={500}
                aria-describedby={error ? "cancel-error" : undefined}
              />
            </div>

            {error && (
              <p id="cancel-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={isPending}>
                  {t("cancelDialogClose")}
                </Button>
              }
            />
            <Button
              variant="destructive"
              disabled={isPending || (hasDeposits && !acknowledgedDeposits)}
              onClick={confirmCancel}
            >
              {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("action_cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      {!isTerminal && order.status !== "cancelled" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{t("payments")}</p>
            <Button size="sm" variant="outline" onClick={() => setShowPaymentForm((v) => !v)}>
              {t("recordPayment")}
            </Button>
          </div>

          {showPaymentForm && (
            <form onSubmit={recordPayment} className="border rounded-md p-4 space-y-3 bg-muted/20">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="amount">
                    {t("paymentAmount")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min={1}
                    required
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="method">
                    {t("paymentMethod")}
                  </label>
                  <select
                    id="method"
                    name="method"
                    defaultValue="cash"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                  >
                    <option value="cash">{t("cash")}</option>
                    <option value="card">{t("card")}</option>
                    <option value="transfer">{t("transfer")}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="paidAt">
                    {t("paymentDate")}
                  </label>
                  <input
                    id="paidAt"
                    name="paidAt"
                    type="datetime-local"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                {t("recordPayment")}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Payment history */}
      {order.payments.length > 0 && (
        <div className="space-y-2">
          {showPaymentForm || <p className="text-sm font-semibold">{t("payments")}</p>}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("paymentDate")}</th>
                  <th className="px-3 py-2 text-right font-medium font-mono">
                    {t("paymentAmount")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">{t("paymentMethod")}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {t("recordedBy")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(p.paidAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      ${p.amount.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {t(p.method as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{p.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Linked batches (T060) */}
      {batches.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("batches")}</p>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("batchTotalPieces")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("batchApprovedPieces")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("batchProgress")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((b) => {
                  const pct =
                    b.totalPieces > 0 ? Math.round((b.approvedPieces / b.totalPieces) * 100) : 0;
                  return (
                    <tr key={b.batchId}>
                      <td className="px-3 py-2">{b.totalPieces}</td>
                      <td className="px-3 py-2">{b.approvedPieces}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
