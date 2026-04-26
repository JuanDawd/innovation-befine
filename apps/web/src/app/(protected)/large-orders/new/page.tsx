import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { listClientsForOrder } from "../actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CreateLargeOrderForm } from "../create-large-order-form";

export default async function NewLargeOrderPage() {
  const t = await getTranslations("largeOrders");
  const session = await auth.api.getSession({ headers: await headers() });
  const isCashierAdmin = session ? hasRole(session.user, "cashier_admin") : false;

  const [clientsResult, piecesResult] = await Promise.all([
    listClientsForOrder(),
    listActiveClothPieces(),
  ]);
  const clients = clientsResult.success ? clientsResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/large-orders" className="hover:text-foreground transition-colors">
          {t("backToList")}
        </Link>
        <ChevronLeftIcon className="h-4 w-4 rotate-180" />
      </div>
      <h1 className="text-4xl font-bold">{t("newOrder")}</h1>
      <CreateLargeOrderForm
        clients={clients}
        clothPieces={clothPieces}
        canOverridePrice={isCashierAdmin}
      />
    </div>
  );
}
