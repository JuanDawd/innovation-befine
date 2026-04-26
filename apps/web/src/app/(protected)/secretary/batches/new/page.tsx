/**
 * Secretary — create cloth batch (T045)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { CreateBatchForm } from "@/components/create-batch-form";
import { listLargeOrders } from "@/app/(protected)/large-orders/actions";

export default async function SecretaryCreateBatchPage() {
  const t = await getTranslations("batches");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const ordersResult = await listLargeOrders();
  const activeOrders = ordersResult.success
    ? ordersResult.data
        .filter((o) => o.status !== "cancelled" && o.status !== "paid_in_full")
        .map((o) => ({ id: o.id, clientName: o.clientName, description: o.description }))
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">{t("createBatch")}</h1>
        <p className="text-sm text-muted-foreground">{t("createBatchDescription")}</p>
      </div>
      <CreateBatchForm redirectPath="/secretary/batches" largeOrders={activeOrders} />
    </div>
  );
}
