import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PencilIcon } from "lucide-react";
import { computePedidoTotal, formatPedidoNumber, lineUnits } from "@befine/db/pedido-totals";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatMoney } from "@/i18n";
import { getPedidoFormData, getPedidoForEdit } from "../actions";

/**
 * Pedido summary — T116 landing page after create/edit.
 * The full detail (progress per cell, payments, deliveries, Historial) is T117.
 */
export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("pedidos");
  const tc = await getTranslations("common");
  const [res, data] = await Promise.all([getPedidoForEdit(id), getPedidoFormData()]);
  if (!res.success) {
    if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") redirect("/403");
    notFound();
  }
  if (!data.success) redirect("/403");
  const pedido = res.data;
  const variants = new Map(data.data.variants.map((v) => [v.id, v]));
  const sizes = new Map(data.data.sizes.map((s) => [s.id, s.label]));
  const colors = new Map(data.data.colors.map((c) => [c.id, c.label]));
  const total = computePedidoTotal(pedido.lines);
  const units = pedido.lines.reduce(
    (n, l) => (l.kind === "garment" ? n + lineUnits(l.cells) : n),
    0,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("pedidoTitle", { number: formatPedidoNumber(pedido.number) })}
        description={pedido.client ? pedido.client.name : t("inventory")}
        backHref="/pedidos"
        backLabel={tc("back")}
        actions={
          <Link href={`/pedidos/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <PencilIcon className="size-4" aria-hidden="true" />
            {tc("edit")}
          </Link>
        }
      />

      <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("form.deliveryDate")}</dt>
          <dd className="font-medium">{pedido.estimatedDeliveryDate ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("unitsLabel")}</dt>
          <dd className="font-mono font-medium tabular-nums">{units}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("total")}</dt>
          <dd className="font-mono font-semibold tabular-nums">{formatMoney(total)}</dd>
        </div>
        {pedido.notes && (
          <div className="col-span-full">
            <dt className="text-muted-foreground">{t("form.notes")}</dt>
            <dd className="whitespace-pre-wrap">{pedido.notes}</dd>
          </div>
        )}
      </dl>

      <ul className="space-y-3">
        {pedido.lines.map((l, i) =>
          l.kind === "adjustment" ? (
            <li
              key={l.id ?? i}
              className="flex justify-between gap-3 rounded-xl border border-dashed p-4 text-sm"
            >
              <span>{l.priceReason}</span>
              <span className="font-mono tabular-nums">{formatMoney(l.amount)}</span>
            </li>
          ) : (
            <li key={l.id ?? i} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {(() => {
                    const v = variants.get(l.clothPieceVariantId);
                    return v ? `${v.pieceName} — ${v.variantName}` : "—";
                  })()}
                  {(l.colorId || l.colorOther) && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {l.colorId ? colors.get(l.colorId) : l.colorOther}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums">
                  {lineUnits(l.cells)} × {formatMoney(l.unitPrice)} ={" "}
                  <strong>{formatMoney(l.unitPrice * lineUnits(l.cells))}</strong>
                </span>
              </div>
              <p className="flex flex-wrap gap-2">
                {l.cells.map((c, j) => (
                  <span
                    key={j}
                    className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums"
                  >
                    {c.sizeId ? sizes.get(c.sizeId) : c.sizeOther} · {c.quantity}
                  </span>
                ))}
              </p>
              {l.style && <p className="text-muted-foreground">{l.style}</p>}
              {l.instructions && (
                <p className="whitespace-pre-wrap text-muted-foreground">{l.instructions}</p>
              )}
              {l.priceReason && (
                <p className="text-xs text-muted-foreground">
                  {t("priceReasonShown", { reason: l.priceReason })}
                </p>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
