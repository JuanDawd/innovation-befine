import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ModalShell } from "@/components/modal-shell";
import { CreateProductForm } from "@/components/create-product-form";
import { listLargeOrders } from "@/app/(protected)/large-orders/actions";

export default async function AdminNewProductModal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  const [t, ordersResult] = await Promise.all([getTranslations("products"), listLargeOrders()]);
  const activeOrders = ordersResult.success
    ? ordersResult.data
        .filter((o) => o.status !== "cancelled" && o.status !== "paid_in_full")
        .map((o) => ({ id: o.id, clientName: o.clientName, description: o.description }))
    : [];

  return (
    <ModalShell title={t("createProduct")} maxWidth="lg">
      <CreateProductForm redirectPath="/admin/products" largeOrders={activeOrders} />
    </ModalShell>
  );
}
