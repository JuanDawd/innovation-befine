import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getDb } from "@/lib/db";
import { getCraftableDetail } from "@befine/db";
import { CraftableDetail } from "@/components/craftable-detail";

export default async function SecretaryCraftableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const db = getDb();
  const data = await getCraftableDetail(db, id);
  if (!data) notFound();

  return <CraftableDetail initialData={data} isEditor={true} backHref="/secretary/craftables" />;
}
