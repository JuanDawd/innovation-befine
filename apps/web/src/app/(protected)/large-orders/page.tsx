import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { listLargeOrders, listClientsForOrder } from "./actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { LargeOrdersTable } from "./large-orders-table";
import { NewLargeOrderDialog } from "./new-large-order-dialog";

export default async function LargeOrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier", "admin", "secretary")) redirect("/");

  const t = await getTranslations("largeOrders");
  const canCreate = hasRole(session.user, "admin", "secretary");
  const canOverridePrice = hasRole(session.user, "admin");

  const [ordersResult, clientsResult, piecesResult] = await Promise.all([
    listLargeOrders(),
    canCreate ? listClientsForOrder() : Promise.resolve({ success: true as const, data: [] }),
    canCreate ? listActiveClothPieces() : Promise.resolve({ success: true as const, data: [] }),
  ]);

  const orders = ordersResult.success ? ordersResult.data : [];
  const clients = clientsResult.success ? clientsResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("pageTitle")}</h1>
        {canCreate && (
          <NewLargeOrderDialog
            clients={clients}
            clothPieces={clothPieces}
            canOverridePrice={canOverridePrice}
          />
        )}
      </div>
      <LargeOrdersTable orders={orders} />
    </div>
  );
}
