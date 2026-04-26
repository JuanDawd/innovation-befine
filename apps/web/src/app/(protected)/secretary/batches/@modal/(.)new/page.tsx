import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ModalShell } from "@/components/modal-shell";
import { CreateBatchForm } from "@/components/create-batch-form";
import { listLargeOrders } from "@/app/(protected)/large-orders/actions";

export default async function SecretaryNewBatchModal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const [t, ordersResult] = await Promise.all([getTranslations("batches"), listLargeOrders()]);
  const activeOrders = ordersResult.success
    ? ordersResult.data
        .filter((o) => o.status !== "cancelled" && o.status !== "paid_in_full")
        .map((o) => ({ id: o.id, clientName: o.clientName, description: o.description }))
    : [];

  return (
    <ModalShell title={t("createBatch")} maxWidth="lg">
      <CreateBatchForm redirectPath="/secretary/batches" largeOrders={activeOrders} />
    </ModalShell>
  );
}
