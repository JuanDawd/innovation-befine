import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { listLargeOrders } from "./actions";
import { LargeOrdersTable } from "./large-orders-table";

export default async function LargeOrdersPage() {
  const t = await getTranslations("largeOrders");
  const result = await listLargeOrders();
  const orders = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold">{t("pageTitle")}</h1>
        <Link href="/large-orders/new" className={buttonVariants({ variant: "default" })}>
          <PlusIcon className="h-4 w-4 mr-2" />
          {t("newOrder")}
        </Link>
      </div>
      <LargeOrdersTable orders={orders} />
    </div>
  );
}
