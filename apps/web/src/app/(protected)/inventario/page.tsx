/**
 * Inventario — T128 (spec §3.10). Admin manages, cashier views (middleware + actions).
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getInventory } from "./actions";
import { InventoryScreen } from "./inventory-screen";

export default async function InventarioPage() {
  const t = await getTranslations("inventario");
  const res = await getInventory();
  if (!res.success) redirect(res.error.code === "UNAUTHORIZED" ? "/login" : "/403");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
      <InventoryScreen data={res.data} />
    </div>
  );
}
