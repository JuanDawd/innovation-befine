import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { buttonVariants } from "@/components/ui/button-variants";
import { listPedidos } from "./actions";
import { PedidosList } from "./pedidos-list";

async function PedidosData() {
  const res = await listPedidos();
  if (!res.success) redirect("/403");
  return <PedidosList pedidos={res.data} />;
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
        <PedidosData />
      </Suspense>
    </div>
  );
}
