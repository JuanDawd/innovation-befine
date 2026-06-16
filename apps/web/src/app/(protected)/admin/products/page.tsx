import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ProductApprovalBoard } from "@/components/product-approval-board";
import { ProductsDashboardTable } from "@/components/products-dashboard-table";
import { NewProductDialog } from "@/components/new-product-dialog";
import { listLargeOrders } from "@/app/(protected)/large-orders/actions";

export default async function AdminProductsPage() {
  const t = await getTranslations("products");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "admin")) redirect("/admin");

  const ordersResult = await listLargeOrders();
  const activeOrders = ordersResult.success
    ? ordersResult.data
        .filter((o) => o.status !== "cancelled" && o.status !== "paid_in_full")
        .map((o) => ({ id: o.id, clientName: o.clientName, description: o.description }))
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("pageTitle")}</h1>
        <NewProductDialog redirectPath="/admin/products" largeOrders={activeOrders} />
      </div>
      <ProductsDashboardTable isAdmin />
      <ProductApprovalBoard />
    </div>
  );
}
