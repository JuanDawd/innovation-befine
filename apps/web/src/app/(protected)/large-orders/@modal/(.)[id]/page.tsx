import { notFound } from "next/navigation";
import { getLargeOrder, getLargeOrderCraftableSummary } from "../../actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import {
  getOrderItemsWithProgressData,
  listActiveClothiers,
  getCurrentUserProductionContext,
} from "../../assignment-actions";
import { ModalShell } from "@/components/modal-shell";
import { LargeOrderDetail } from "../../[id]/large-order-detail";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LargeOrderDetailModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Let the static (.)new route handle its own segment
  if (!UUID_RE.test(id)) return null;

  const [orderResult, batchResult, piecesResult, productionResult, clothiersResult, userCtx] =
    await Promise.all([
      getLargeOrder(id),
      getLargeOrderCraftableSummary(id),
      listActiveClothPieces(),
      getOrderItemsWithProgressData(id),
      listActiveClothiers(),
      getCurrentUserProductionContext(),
    ]);

  if (!orderResult.success) notFound();

  const batches = batchResult.success ? batchResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];
  const productionItems = productionResult.success ? productionResult.data : null;
  const clothiers = clothiersResult.success ? clothiersResult.data : [];

  return (
    <ModalShell title={orderResult.data.clientName} maxWidth="2xl">
      <LargeOrderDetail
        order={orderResult.data}
        batches={batches}
        clothPieces={clothPieces}
        productionItems={productionItems}
        clothiers={clothiers}
        userRole={userCtx.role}
        currentEmployeeId={userCtx.employeeId}
      />
    </ModalShell>
  );
}
