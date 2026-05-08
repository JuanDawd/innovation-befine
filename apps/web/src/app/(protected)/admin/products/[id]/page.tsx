import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getDb } from "@/lib/db";
import { getProductDetail } from "@befine/db";
import { ProductDetail } from "@/components/product-detail";

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "admin")) redirect("/admin");

  const db = getDb();
  const data = await getProductDetail(db, id);
  if (!data) notFound();

  return <ProductDetail initialData={data} isEditor={true} backHref="/admin/products" />;
}
