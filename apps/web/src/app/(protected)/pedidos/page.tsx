import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlusIcon, ShoppingBagIcon } from "lucide-react";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatMoney } from "@/i18n";
import { listPedidos } from "./actions";

async function PedidosList() {
  const t = await getTranslations("pedidos");
  const res = await listPedidos();
  if (!res.success) redirect("/403");
  if (res.data.length === 0)
    return (
      <EmptyState
        icon={ShoppingBagIcon}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {res.data.map((p) => (
        <li key={p.id}>
          <Link
            href={`/pedidos/${p.id}`}
            className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
          >
            <span className="font-mono text-sm font-semibold tabular-nums">
              {formatPedidoNumber(p.number)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {p.clientName ?? t("inventory")}
              {p.cancelled && (
                <span className="ml-2 text-xs text-muted-foreground">{t("cancelled")}</span>
              )}
            </span>
            <span className="text-sm text-muted-foreground">{t("units", { count: p.units })}</span>
            <span className="w-28 text-right font-mono text-sm tabular-nums">
              {formatMoney(p.total)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PedidosPage() {
  const t = await getTranslations("pedidos");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("pageTitle")}
        actions={
          <Link href="/pedidos/new" className={buttonVariants()}>
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("newPedido")}
          </Link>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <PedidosList />
      </Suspense>
    </div>
  );
}
