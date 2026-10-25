import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangleIcon, CalendarClockIcon, PencilIcon } from "lucide-react";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import type { PedidoDetail } from "@befine/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";
import { getPedido } from "../actions";
import { CancelPedidoDialog } from "./cancel-pedido-dialog";
import { RecordDeliveryDialog, type DeliverableLine } from "./record-delivery-dialog";

/**
 * Pedido detail — T117 (spec §3.3, §3.10)
 *
 * Every number is derived: status and its explanation, per-size progress
 * (ordered · assigned · approved · delivered), balance and saldo a favor.
 * Historial comes with T132. Skeleton: loading.tsx.
 */

function formatDateTime(at: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(at);
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

async function StatusCard({ pedido }: { pedido: PedidoDetail }) {
  const t = await getTranslations("pedidos.detail");
  const { ordered, approved, delivered } = pedido.progress;
  const explanation = (() => {
    switch (pedido.status) {
      case "pending":
        return t("explain.pending", { ordered });
      case "in_production":
        return t("explain.inProduction", { approved, ordered });
      case "ready":
        return pedido.destination === "inventory"
          ? t("explain.readyInventory", { ordered })
          : t("explain.ready", { ordered });
      case "partially_delivered":
        return t("explain.partial", { delivered, ordered });
      case "delivered":
        return t("explain.delivered", { balance: formatMoney(pedido.balance) });
      case "paid":
        return t("explain.paid");
      case "cancelled":
        return t("explain.cancelled", { reason: pedido.cancellationReason ?? "" });
    }
  })();
  const pct = ordered > 0 ? Math.round((approved / ordered) * 100) : 0;

  return (
    <section aria-labelledby="pedido-status" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="pedido-status" className="sr-only">
        {t("statusTitle")}
      </h2>
      <p className="text-sm">{explanation}</p>
      {pedido.status !== "cancelled" && ordered > 0 && (
        <div className="space-y-1">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ordered}
            aria-valuenow={approved}
            aria-label={t("approvedBar")}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t("counts.assigned", { n: pedido.progress.assigned })}</span>
            <span>{t("counts.approved", { n: approved })}</span>
            {pedido.destination === "client" && (
              <span>{t("counts.delivered", { n: delivered })}</span>
            )}
            {pedido.progress.unassigned > 0 && (
              <span>{t("counts.unassigned", { n: pedido.progress.unassigned })}</span>
            )}
            {pedido.progress.pendingReview > 0 && (
              <span>{t("counts.pendingReview", { n: pedido.progress.pendingReview })}</span>
            )}
          </p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("delivery")}</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            {pedido.estimatedDeliveryDate ? formatDay(pedido.estimatedDeliveryDate) : "—"}
            {pedido.deliveryFlag === "overdue" && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                {t("overdue")}
              </span>
            )}
            {pedido.deliveryFlag === "today" && (
              <span className="inline-flex items-center gap-1 text-xs text-status-attention-foreground">
                <CalendarClockIcon className="size-3.5" aria-hidden="true" />
                {t("today")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("created")}</dt>
          <dd className="font-medium">
            {formatDateTime(pedido.createdAt)}
            {pedido.createdByName && (
              <span className="block text-xs font-normal text-muted-foreground">
                {pedido.createdByName}
              </span>
            )}
          </dd>
        </div>
        {pedido.notes && (
          <div className="col-span-full">
            <dt className="text-muted-foreground">{t("notes")}</dt>
            <dd className="whitespace-pre-wrap">{pedido.notes}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

async function MoneyCard({ pedido }: { pedido: PedidoDetail }) {
  const t = await getTranslations("pedidos.detail");
  return (
    <section aria-labelledby="pedido-money" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="pedido-money" className="text-lg font-semibold">
        {t("moneyTitle")}
      </h2>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("total")}</dt>
          <dd className="font-mono font-semibold tabular-nums">{formatMoney(pedido.total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("paid")}</dt>
          <dd className="font-mono tabular-nums">{formatMoney(pedido.paid)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {pedido.saldoAFavor > 0 ? t("credit") : t("balance")}
          </dt>
          <dd
            className={cn(
              "font-mono font-semibold tabular-nums",
              pedido.saldoAFavor > 0 && "text-status-attention-foreground",
            )}
          >
            {pedido.status === "cancelled" && pedido.saldoAFavor === 0
              ? "—"
              : formatMoney(pedido.saldoAFavor > 0 ? pedido.saldoAFavor : pedido.balance)}
          </dd>
        </div>
      </dl>
      {pedido.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPayments")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {pedido.payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
            >
              <span>
                {formatDateTime(p.receivedAt)} · {t(`methods.${p.method}`)}
                {p.recordedByName && (
                  <span className="text-muted-foreground"> · {p.recordedByName}</span>
                )}
                {p.afterHours && (
                  <span className="block text-xs text-muted-foreground">{t("afterHours")}</span>
                )}
                {p.note && <span className="block text-xs text-muted-foreground">{p.note}</span>}
              </span>
              <span className="font-mono tabular-nums">{formatMoney(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function LinesSection({ pedido }: { pedido: PedidoDetail }) {
  const t = await getTranslations("pedidos.detail");
  const isClient = pedido.destination === "client";
  return (
    <section aria-labelledby="pedido-lines" className="space-y-3">
      <h2 id="pedido-lines" className="text-lg font-semibold">
        {t("linesTitle")}
      </h2>
      {pedido.lines.map((line) =>
        line.kind === "adjustment" ? (
          <div
            key={line.id}
            className="flex justify-between gap-3 rounded-xl border border-dashed p-4 text-sm"
          >
            <span>
              <span className="font-medium">
                {line.amount < 0 ? t("discount") : t("surcharge")}
              </span>
              <span className="text-muted-foreground"> · {line.reason}</span>
            </span>
            <span className="font-mono tabular-nums">{formatMoney(line.amount)}</span>
          </div>
        ) : (
          <article key={line.id} className="space-y-3 rounded-xl border bg-card p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {line.pieceName} — {line.variantName}
                </h3>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {line.colorLabel && (
                    <span className="inline-flex items-center gap-1.5">
                      {line.colorHex && (
                        <span
                          aria-hidden="true"
                          className="inline-block size-3 rounded-full border"
                          style={{ backgroundColor: line.colorHex }}
                        />
                      )}
                      {line.colorLabel}
                    </span>
                  )}
                  {line.style && <span>{line.style}</span>}
                </p>
              </div>
              <p className="text-right font-mono text-sm tabular-nums">
                {line.progress.ordered} × {formatMoney(line.unitPrice)}
                <span className="block font-semibold">{formatMoney(line.total)}</span>
              </p>
            </header>
            {line.instructions && (
              <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                {line.instructions}
              </p>
            )}
            {line.priceReason && (
              <p className="text-xs text-muted-foreground">
                {t("priceReason", { reason: line.priceReason })}
              </p>
            )}
            <table className="w-full text-sm">
              <caption className="sr-only">{t("sizesCaption")}</caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 text-left font-medium">
                    {t("size")}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t("ordered")}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t("assigned")}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t("approved")}
                  </th>
                  {isClient && (
                    <th scope="col" className="py-1.5 text-right font-medium">
                      {t("delivered")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {line.cells.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <th scope="row" className="py-1.5 text-left font-sans font-medium">
                      {c.sizeLabel}
                    </th>
                    <td className="py-1.5 text-right">{c.progress.ordered}</td>
                    <td className="py-1.5 text-right">{c.progress.assigned}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right",
                        c.progress.approved >= c.progress.ordered &&
                          "text-status-success-foreground",
                      )}
                    >
                      {c.progress.approved}
                    </td>
                    {isClient && <td className="py-1.5 text-right">{c.progress.delivered}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ),
      )}
    </section>
  );
}

async function DeliveriesSection({ pedido }: { pedido: PedidoDetail }) {
  const t = await getTranslations("pedidos.detail");
  if (pedido.destination === "inventory") return null;
  const deliverable: DeliverableLine[] = pedido.lines.flatMap((l) => {
    if (l.kind !== "garment") return [];
    const cells = l.cells
      .filter((c) => c.progress.readyToDeliver > 0)
      .map((c) => ({ id: c.id, label: c.sizeLabel, ready: c.progress.readyToDeliver }));
    return cells.length ? [{ id: l.id, title: `${l.pieceName} — ${l.variantName}`, cells }] : [];
  });
  const open = pedido.status !== "cancelled";
  return (
    <section
      aria-labelledby="pedido-deliveries"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pedido-deliveries" className="text-lg font-semibold">
          {t("deliveriesTitle")}
        </h2>
        {open && deliverable.length > 0 && (
          <RecordDeliveryDialog pedidoId={pedido.id} lines={deliverable} />
        )}
      </div>
      {open && deliverable.length === 0 && pedido.progress.delivered < pedido.progress.ordered && (
        <p className="text-xs text-muted-foreground">{t("nothingReady")}</p>
      )}
      {pedido.deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noDeliveries")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {pedido.deliveries.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>
                {formatDateTime(d.deliveredAt)}
                {d.deliveredByName && (
                  <span className="text-muted-foreground"> · {d.deliveredByName}</span>
                )}
                {d.note && <span className="block text-xs text-muted-foreground">{d.note}</span>}
              </span>
              <span className="tabular-nums">{t("deliveredUnits", { count: d.units })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PedidoContent({ pedido }: { pedido: PedidoDetail }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        <StatusCard pedido={pedido} />
        <LinesSection pedido={pedido} />
      </div>
      <div className="min-w-0 space-y-6">
        {pedido.destination === "client" && <MoneyCard pedido={pedido} />}
        <DeliveriesSection pedido={pedido} />
      </div>
    </div>
  );
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("pedidos");
  const tc = await getTranslations("common");
  const res = await getPedido(id);
  if (!res.success) {
    if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") redirect("/403");
    notFound();
  }
  const pedido = res.data;
  const subtitle = pedido.client
    ? [pedido.client.name, pedido.client.phone].filter(Boolean).join(" · ")
    : t("inventory");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("pedidoTitle", { number: formatPedidoNumber(pedido.number) })}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={pedido.status} label={t(`status.${pedido.status}`)} />
            <span>{subtitle}</span>
          </span>
        }
        backHref="/pedidos"
        backLabel={tc("back")}
        actions={
          pedido.status !== "cancelled" ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/pedidos/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <PencilIcon className="size-4" aria-hidden="true" />
                {tc("edit")}
              </Link>
              {/* Cancelling is blocked once units are approved (spec §3.4.18). */}
              {pedido.progress.approved === 0 && (
                <CancelPedidoDialog
                  pedidoId={id}
                  number={formatPedidoNumber(pedido.number)}
                  version={pedido.version}
                  paid={pedido.paid}
                />
              )}
            </div>
          ) : undefined
        }
      />
      <PedidoContent pedido={pedido} />
    </div>
  );
}
