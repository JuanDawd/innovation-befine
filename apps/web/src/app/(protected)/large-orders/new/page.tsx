import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { listClientsForOrder } from "../actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CreateLargeOrderForm } from "../create-large-order-form";

export default async function NewLargeOrderPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin", "secretary")) redirect("/large-orders");

  const t = await getTranslations("largeOrders");
  const [clientsResult, piecesResult] = await Promise.all([
    listClientsForOrder(),
    listActiveClothPieces(),
  ]);

  const clients = clientsResult.success ? clientsResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];
  const isCashierAdmin = hasRole(session.user, "cashier_admin");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold">{t("newOrder")}</h1>
      <CreateLargeOrderForm
        clients={clients}
        clothPieces={clothPieces}
        canOverridePrice={isCashierAdmin}
      />
    </div>
  );
}
