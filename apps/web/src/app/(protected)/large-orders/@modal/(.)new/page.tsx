import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ModalShell } from "@/components/modal-shell";
import { listClientsForOrder } from "../../actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CreateLargeOrderForm } from "../../create-large-order-form";

export default async function NewLargeOrderModal() {
  const [t, session, clientsResult, piecesResult] = await Promise.all([
    getTranslations("largeOrders"),
    (async () => {
      const h = await headers();
      return auth.api.getSession({ headers: h });
    })(),
    listClientsForOrder(),
    listActiveClothPieces(),
  ]);

  const isCashierAdmin = session ? hasRole(session.user, "cashier_admin") : false;
  const clients = clientsResult.success ? clientsResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <ModalShell title={t("newOrder")} maxWidth="xl">
      <CreateLargeOrderForm
        clients={clients}
        clothPieces={clothPieces}
        canOverridePrice={isCashierAdmin}
      />
    </ModalShell>
  );
}
