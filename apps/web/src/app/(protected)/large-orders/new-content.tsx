import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { listClientsForOrder } from "./actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { CreateLargeOrderForm } from "./create-large-order-form";

/** Shared by the `new` modal (intercepted) and the full `/new` page (direct load / refresh). */
export async function NewLargeOrderContent() {
  const [session, clientsResult, piecesResult] = await Promise.all([
    (async () => {
      const h = await headers();
      return auth.api.getSession({ headers: h });
    })(),
    listClientsForOrder(),
    listActiveClothPieces(),
  ]);

  const isCashierAdmin = session ? hasRole(session.user, "admin") : false;
  const clients = clientsResult.success ? clientsResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <CreateLargeOrderForm
      clients={clients}
      clothPieces={clothPieces}
      canOverridePrice={isCashierAdmin}
    />
  );
}
