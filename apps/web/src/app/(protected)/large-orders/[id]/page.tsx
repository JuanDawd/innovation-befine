import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { getLargeOrder, getLargeOrderCraftableSummary } from "../actions";
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
    getLargeOrderCraftableSummary(id),
    listActiveClothPieces(),
  ]);

  if (!orderResult.success) notFound();

  const batches = batchResult.success ? batchResult.data : [];
  const clothPieces = piecesResult.success ? piecesResult.data : [];

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-2xl mx-auto w-full">
      <Link
        href="/large-orders"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ChevronLeftIcon className="size-4" />
        {t("backToList")}
      </Link>
      <div className="rounded-lg border bg-card p-5 md:p-6 shadow-sm">
        <LargeOrderDetail order={orderResult.data} batches={batches} clothPieces={clothPieces} />
      </div>
    </div>
  );
}
