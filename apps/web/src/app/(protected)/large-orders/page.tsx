import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { listLargeOrders } from "./actions";
import { LargeOrdersTable } from "./large-orders-table";

export default async function LargeOrdersPage() {
  const t = await getTranslations("largeOrders");
  const result = await listLargeOrders();
  const orders = result.success ? result.data : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("pageTitle")}</h1>
        <Link
          href="/large-orders/new"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          {t("newOrder")}
        </Link>
      </div>
      <LargeOrdersTable orders={orders} />
    </div>
  );
}
