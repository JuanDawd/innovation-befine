import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { listClientsForOrder } from "../actions";
import { CreateLargeOrderForm } from "../create-large-order-form";

export default async function NewLargeOrderPage() {
  const t = await getTranslations("largeOrders");
  const clientsResult = await listClientsForOrder();
  const clients = clientsResult.success ? clientsResult.data : [];

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/large-orders" className="hover:text-foreground transition-colors">
          {t("backToList")}
        </Link>
        <ChevronLeftIcon className="h-4 w-4 rotate-180" />
      </div>
      <h1 className="text-4xl font-bold">{t("newOrder")}</h1>
      <CreateLargeOrderForm clients={clients} />
    </div>
  );
}
