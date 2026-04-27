import { notFound } from "next/navigation";
import { getLargeOrder, getLargeOrderBatchSummary } from "../../actions";
import { LargeOrderDetail } from "../../[id]/large-order-detail";
import { ModalShell } from "@/components/modal-shell";

export default async function LargeOrderDetailModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [orderResult, batchResult] = await Promise.all([
    getLargeOrder(id),
    getLargeOrderBatchSummary(id),
  ]);

  if (!orderResult.success) notFound();

  const batches = batchResult.success ? batchResult.data : [];

  return (
    <ModalShell title={orderResult.data.clientName} maxWidth="2xl">
      <LargeOrderDetail order={orderResult.data} batches={batches} />
    </ModalShell>
  );
}
