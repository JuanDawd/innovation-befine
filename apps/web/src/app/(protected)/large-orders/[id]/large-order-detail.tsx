"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Loader2Icon,
  PencilIcon,
  CheckIcon,
  XIcon,
  AlertTriangleIcon,
  PlusIcon,
  PackageIcon,
  CalendarIcon,
  FileTextIcon,
  CreditCardIcon,
} from "lucide-react";
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
  type OrderCraftableSummary,
} from "../actions";
import type { ClothPieceRow } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import {
  LineAccordion,
  buildDescription,
  parseDescription,
  type OrderLine,
} from "../line-accordion";

type Props = {
  order: LargeOrderRow;
  batches: OrderCraftableSummary[];
  clothPieces: ClothPieceRow[];
};

const ACTIONS_BY_STATUS: Record<string, string[]> = {
  pending: ["start_production", "cancel"],
  in_production: ["mark_ready", "cancel"],
  ready: ["mark_delivered", "cancel"],
  delivered: ["mark_paid", "cancel"],
};

function blankLine(key: number): OrderLine {
  return {
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
  };
}

function matchLineTocatalog(
  label: string,
  notes: string,
  clothPieces: ClothPieceRow[],
  key: number,
): OrderLine {
  // label format: "Nx PieceName (VariantName)" or "Nx PieceName"
  const qtyMatch = label.match(/^(\d+)x\s+(.+)$/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  const rest = qtyMatch ? qtyMatch[2].trim() : label.trim();

  // Try to extract variant from parentheses: "PieceName (VariantName)"
  const parenMatch = rest.match(/^(.+?)\s+\((.+)\)$/);
  const pieceName = parenMatch ? parenMatch[1].trim() : rest;
  const variantName = parenMatch ? parenMatch[2].trim() : null;

  const piece = clothPieces.find((p) => p.name.toLowerCase() === pieceName.toLowerCase());
  if (!piece)
    return {
      key,
      clothPieceId: "",
      clothPieceVariantId: "",
      quantity,
      unitPrice: 0,
      itemDescription: notes,
      color: "",
      style: "",
      size: "",
      instructions: "",
    };

  const variant = variantName
    ? piece.variants.find((v) => v.name.toLowerCase() === variantName.toLowerCase())
    : (piece.variants.find((v) => v.isActive) ?? piece.variants[0]);

  return {
    key,
    clothPieceId: piece.id,
    clothPieceVariantId: variant?.id ?? "",
    quantity,
    unitPrice: variant?.pieceRate ?? 0,
    itemDescription: notes,
    color: "",
    style: "",
    size: "",
    instructions: "",
  };
}

export function LargeOrderDetail({ order: initialOrder, batches, clothPieces }: Props) {
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

  // Edit form state — lines
  const [editLines, setEditLines] = useState<OrderLine[]>(() => {
    const parsed = parseDescription(order.description);
    if (parsed.length === 0) return [blankLine(0)];
    return parsed.map((p, i) => matchLineTocatalog(p.label, p.notes, clothPieces, i));
  });
  const [nextKey, setNextKey] = useState(editLines.length);
  const [openEditKey, setOpenEditKey] = useState<number>(editLines[0]?.key ?? 0);
  const editGrandTotal = editLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const [editLineErrors, setEditLineErrors] = useState<Set<number>>(new Set());
  const [editEta, setEditEta] = useState(
    order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toISOString().slice(0, 16) : "",
  );
  const [editNotes, setEditNotes] = useState(order.notes ?? "");

  function addEditLine() {
    const key = nextKey;
    setEditLines((prev) => [...prev, blankLine(key)]);
    setNextKey((k) => k + 1);
    setOpenEditKey(key);
  }

  function removeEditLine(key: number) {
    if (editLines.length === 1) return;
    setEditLines((prev) => {
      const next = prev.filter((l) => l.key !== key);
      if (openEditKey === key) setOpenEditKey(next[next.length - 1].key);
      return next;
    });
  }

  function updateEditLine(key: number, patch: Partial<Omit<OrderLine, "key">>) {
    setEditLineErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setEditLines((prev) =>
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

    // Mark lines that have a piece selected but are missing variant or description
    const badKeys = new Set(
      editLines
        .filter((l) => l.clothPieceId && (!l.clothPieceVariantId || !l.itemDescription.trim()))
        .map((l) => l.key),
    );
    setEditLineErrors(badKeys);
    if (badKeys.size > 0) {
      const firstBad = editLines.find((l) => badKeys.has(l.key));
      if (firstBad) setOpenEditKey(firstBad.key);
      setError(t("itemsIncomplete"));
      return;
    }

    // Build description from fully-selected lines; fall back to existing description if none filled
    const builtDescription = buildDescription(editLines, clothPieces);
    const description = builtDescription || order.description;
    const totalPrice = editGrandTotal > 0 ? editGrandTotal : order.totalPrice;

    startTransition(async () => {
      const res = await editLargeOrder(order.id, {
        description,
        totalPrice,
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
  const parsedItems = parseDescription(order.description);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-xl md:text-2xl font-semibold">{order.clientName}</h1>
          <StatusBadge status={order.status} />
        </div>
        {!isTerminal && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon className="h-3.5 w-3.5 mr-1.5" />
            {t("editOrder")}
          </Button>
        )}
      </div>

      {/* ── Edit mode ── */}
      {editing ? (
        <div className="rounded-lg border bg-card p-5 space-y-5">
          <p className="text-sm font-semibold">{t("editOrder")}</p>

          {/* Line items */}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("items")} <span className="text-destructive">*</span>
            </p>
            <div className="space-y-2">
              {editLines.map((line, index) => (
                <LineAccordion
                  key={line.key}
                  line={line}
                  index={index}
                  open={openEditKey === line.key}
                  onToggle={() => setOpenEditKey(openEditKey === line.key ? -1 : line.key)}
                  onRemove={() => removeEditLine(line.key)}
                  onUpdate={(patch) => updateEditLine(line.key, patch)}
                  clothPieces={clothPieces}
                  canRemove={editLines.length > 1}
                  hasError={editLineErrors.has(line.key)}
                />
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addEditLine}>
              <PlusIcon className="size-4" />
              {t("addItem")}
            </Button>
          </div>

          {editGrandTotal > 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("grandTotal")}</span>
              <span className="font-mono font-semibold">
                ${editGrandTotal.toLocaleString("es-CO")}
              </span>
            </div>
          )}

          {/* ETA */}
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("estimatedDelivery")}</label>
            <input
              type="datetime-local"
              value={editEta}
              onChange={(e) => setEditEta(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
            />
          </div>

          {/* Notes */}
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

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={saveEdit}>
              {isPending ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <CheckIcon className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("submit")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setEditLineErrors(new Set());
                setError(null);
              }}
            >
              <XIcon className="h-3.5 w-3.5 mr-1.5" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Items card ── */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <PackageIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{t("items")}</span>
            </div>
            <div className="divide-y">
              {parsedItems.length > 0 ? (
                parsedItems.map((item, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-sm font-medium">{item.label}</p>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {order.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Financial summary ── */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <CreditCardIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Resumen financiero</span>
            </div>
            <div className="grid grid-cols-3 divide-x">
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("totalPrice")}</p>
                <p className="font-mono font-semibold tabular-nums">
                  ${order.totalPrice.toLocaleString("es-CO")}
                </p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("colPaid")}</p>
                <p className="font-mono font-semibold tabular-nums text-green-600 dark:text-green-400">
                  ${order.totalPaid.toLocaleString("es-CO")}
                </p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("balanceDue")}</p>
                <p
                  className={`font-mono font-semibold tabular-nums ${
                    order.balanceDue > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-green-600 dark:text-green-400"
                  }`}
                >
                  ${order.balanceDue.toLocaleString("es-CO")}
                </p>
              </div>
            </div>
          </div>

          {/* ── Meta ── */}
          {(order.estimatedDeliveryAt || order.notes || order.cancellationReason) && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <FileTextIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Detalles</span>
              </div>
              <dl className="divide-y text-sm">
                {order.estimatedDeliveryAt && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <dt className="text-muted-foreground w-32 shrink-0">
                      {t("estimatedDelivery")}
                    </dt>
                    <dd>
                      {new Date(order.estimatedDeliveryAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        dateStyle: "medium",
                      })}
                    </dd>
                  </div>
                )}
                {order.notes && (
                  <div className="px-4 py-3">
                    <dt className="text-xs text-muted-foreground mb-1">{t("notes")}</dt>
                    <dd className="text-muted-foreground whitespace-pre-wrap">{order.notes}</dd>
                  </div>
                )}
                {order.cancellationReason && (
                  <div className="px-4 py-3">
                    <dt className="text-xs text-muted-foreground mb-1">
                      {t("cancellationReason")}
                    </dt>
                    <dd className="text-destructive">{order.cancellationReason}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </>
      )}

      {/* ── Status actions ── */}
      {!isTerminal && actions.length > 0 && !editing && (
        <div className="flex flex-wrap gap-2">
          {actions
            .filter((a) => a !== "cancel")
            .map((action) => (
              <Button
                key={action}
                size="sm"
                disabled={isPending}
                onClick={() => transition(action)}
              >
                {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {t(`action_${action}` as Parameters<typeof t>[0])}
              </Button>
            ))}
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            onClick={() => {
              setError(null);
              setCancelDialogOpen(true);
            }}
          >
            <XIcon className="h-3.5 w-3.5 mr-1.5" />
            {t("action_cancel")}
          </Button>
        </div>
      )}

      {/* ── Cancel confirmation dialog ── */}
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
              {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {t("action_cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payments ── */}
      {!isTerminal && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="text-sm font-semibold">{t("payments")}</span>
            <Button size="sm" variant="outline" onClick={() => setShowPaymentForm((v) => !v)}>
              <PlusIcon className="size-3.5 mr-1" />
              {t("recordPayment")}
            </Button>
          </div>

          {showPaymentForm && (
            <form onSubmit={recordPayment} className="px-4 py-4 space-y-3 border-b bg-muted/10">
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
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {t("recordPayment")}
              </Button>
            </form>
          )}

          {order.payments.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/20">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    {t("paymentDate")}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    {t("paymentAmount")}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    {t("paymentMethod")}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    {t("recordedBy")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-muted-foreground text-sm">
                      {new Date(p.paidAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">
                      ${p.amount.toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-sm">
                      {t(p.method as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                      {p.recordedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">Sin pagos registrados</p>
            </div>
          )}
        </div>
      )}

      {/* ── Linked craftables ── */}
      {batches.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <span className="text-sm font-semibold">{t("craftables")}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  {t("craftableTotalPieces")}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  {t("craftableApprovedPieces")}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  {t("craftableProgress")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batches.map((b) => {
                const pct =
                  b.totalPieces > 0 ? Math.round((b.approvedPieces / b.totalPieces) * 100) : 0;
                return (
                  <tr key={b.craftableId}>
                    <td className="px-4 py-2.5">{b.totalPieces}</td>
                    <td className="px-4 py-2.5">{b.approvedPieces}</td>
                    <td className="px-4 py-2.5">
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
      )}

      {!editing && error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
