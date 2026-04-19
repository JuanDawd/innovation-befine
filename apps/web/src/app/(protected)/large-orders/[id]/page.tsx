import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLargeOrder, getLargeOrderBatchSummary } from "../actions";
import { LargeOrderDetail } from "./large-order-detail";

export default async function LargeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("largeOrders");

  const [orderResult, batchResult] = await Promise.all([
    getLargeOrder(id),
    getLargeOrderBatchSummary(id),
  ]);

  if (!orderResult.success) notFound();

  const batches = batchResult.success ? batchResult.data : [];

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/large-orders"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("backToList")}
      </Link>
      <LargeOrderDetail order={orderResult.data} batches={batches} />
    </div>
  );
}
