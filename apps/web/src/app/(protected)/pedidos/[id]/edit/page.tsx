import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { getPedidoFormData, getPedidoForEdit } from "../../actions";
import { PedidoForm } from "../../pedido-form";

async function EditPedidoContent({ id }: { id: string }) {
  const [data, pedido] = await Promise.all([getPedidoFormData(), getPedidoForEdit(id)]);
  if (!data.success) redirect("/403");
  if (!pedido.success) notFound();
  return <PedidoForm data={data.data} pedido={pedido.data} />;
}

export default async function EditPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const pedido = await getPedidoForEdit(id);
  if (!pedido.success) {
    if (pedido.error.code === "UNAUTHORIZED" || pedido.error.code === "FORBIDDEN") redirect("/403");
    notFound();
  }
  if (pedido.data.cancelled) redirect(`/pedidos/${id}`);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("pedidos.editPedido", { number: formatPedidoNumber(pedido.data.number) })}
        backHref={`/pedidos/${id}`}
        backLabel={t("common.back")}
      />
      {pedido.data.started && (
        <p className="rounded-lg border border-status-attention-foreground/30 bg-status-attention/40 p-3 text-sm">
          {t("pedidos.form.startedBanner")}
        </p>
      )}
      <Suspense fallback={<PageSkeleton />}>
        <EditPedidoContent id={id} />
      </Suspense>
    </div>
  );
}
