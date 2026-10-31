/**
 * Admin catalog page — T024, T027, T110
 *
 * Server component: fetches services, cloth pieces, sizes and colours, renders tabbed UI.
 * Only admin can access (enforced by middleware + server actions).
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { ServiceCatalog } from "@/components/service-catalog";
import { ClothPieceCatalog } from "@/components/cloth-piece-catalog";
import { CatalogTabs } from "@/components/catalog-tabs";
import { GarmentAttributeCatalog } from "@/components/garment-attribute-catalog";
import { DetailCatalog } from "@/components/detail-catalog";
import { listAllServices } from "./actions/services";
import { listAllClothPieces } from "./actions/cloth-pieces";
import { listGarmentAttributes } from "./actions/garment-attributes";
import { listDetails } from "./actions/details";
import { PageHeader } from "@/components/page-header";

async function CatalogData() {
  const [servicesResult, piecesResult, garmentsResult, detailsResult] = await Promise.all([
    listAllServices(),
    listAllClothPieces(),
    listGarmentAttributes(),
    listDetails(),
  ]);

  const services = servicesResult.success ? servicesResult.data : [];
  const pieces = piecesResult.success ? piecesResult.data : [];
  const garments = garmentsResult.success ? garmentsResult.data : { sizes: [], colors: [] };

  return (
    <CatalogTabs
      services={<ServiceCatalog initialServices={services} />}
      clothPieces={<ClothPieceCatalog initialPieces={pieces} />}
      garments={
        <GarmentAttributeCatalog initialSizes={garments.sizes} initialColors={garments.colors} />
      }
      details={<DetailCatalog initialDetails={detailsResult.success ? detailsResult.data : []} />}
    />
  );
}

export default async function CatalogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "admin")) redirect("/admin");

  const t = await getTranslations("catalog");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} />

      <Suspense fallback={<PageSkeleton />}>
        <CatalogData />
      </Suspense>
    </div>
  );
}
