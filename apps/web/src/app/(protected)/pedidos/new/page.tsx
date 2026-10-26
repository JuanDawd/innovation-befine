import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NewPedidoContent } from "../new-content";

/** Full-page version of the creation modal, for direct links and refreshes. */
export default async function NewPedidoPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pedidos.newPedido")} backHref="/pedidos" backLabel={t("common.back")} />
      <Suspense fallback={<PageSkeleton />}>
        <NewPedidoContent />
      </Suspense>
    </div>
  );
}
