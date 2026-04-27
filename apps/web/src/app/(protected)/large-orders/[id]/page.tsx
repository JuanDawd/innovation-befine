import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getLargeOrder, getLargeOrderBatchSummary } from "../actions";
import { listActiveClothPieces } from "@/app/(protected)/admin/catalog/actions/cloth-pieces";
import { LargeOrderDetail } from "./large-order-detail";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LargeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) redirect("/large-orders/new");
  const t = await getTranslations("largeOrders");

  const [orderResult, batchResult, piecesResult] = await Promise.all([
    getLargeOrder(id),
    getLargeOrderBatchSummary(id),
    listActiveClothPieces(),
  ]);

  if (!orderResult.success) notFound();

  const batches = batchResult.success ? batchResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/large-orders"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("backToList")}
      </Link>
      <LargeOrderDetail order={orderResult.data} batches={batches} clothPieces={clothPieces} />
    </div>
  );
}
