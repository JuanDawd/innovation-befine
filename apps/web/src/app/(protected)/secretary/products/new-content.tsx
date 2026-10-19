import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { CreateProductForm } from "@/components/create-product-form";
import { listLargeOrders } from "@/app/(protected)/large-orders/actions";

/** Shared by the `new` modal (intercepted) and the full `/new` page (direct load / refresh). */
export async function NewProductContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const ordersResult = await listLargeOrders();
  const activeOrders = ordersResult.success
    ? ordersResult.data
        .filter((o) => o.status !== "cancelled" && o.status !== "paid_in_full")
        .map((o) => ({ id: o.id, clientName: o.clientName, description: o.description }))
    : [];

  return <CreateProductForm redirectPath="/secretary/products" largeOrders={activeOrders} />;
}
