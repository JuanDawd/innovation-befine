/**
 * Producción — T124 (spec §3.10). Admin, cashier, secretary (middleware + actions).
 */

import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ProductionBoard } from "./production-board";

export default async function ProduccionPage() {
  const t = await getTranslations("produccion");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
      <ProductionBoard />
    </div>
  );
}
