/**
 * Admin catalog page — T024, T027
 *
 * Server component: fetches all services and cloth pieces, renders tabbed UI.
 * Only cashier_admin can access (enforced by middleware + server actions).
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { ServiceCatalog } from "@/components/service-catalog";
import { ClothPieceCatalog } from "@/components/cloth-piece-catalog";
import { CatalogTabs } from "@/components/catalog-tabs";
import { listAllServices } from "./actions/services";
import { listAllClothPieces } from "./actions/cloth-pieces";

async function CatalogData() {
  const [servicesResult, piecesResult] = await Promise.all([
    listAllServices(),
    listAllClothPieces(),
  ]);

  const services = servicesResult.success ? servicesResult.data : [];
  const pieces = piecesResult.success ? piecesResult.data : [];

  return (
    <CatalogTabs
      services={<ServiceCatalog initialServices={services} />}
      clothPieces={<ClothPieceCatalog initialPieces={pieces} />}
    />
  );
}

export default async function CatalogPage() {
  const t = await getTranslations("catalog");

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>

      <Suspense fallback={<PageSkeleton />}>
        <CatalogData />
      </Suspense>
    </div>
  );
}
