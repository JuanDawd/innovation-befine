/**
 * Admin — create cloth batch (T045)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { CreateBatchForm } from "@/components/create-batch-form";

export default async function AdminCreateBatchPage() {
  const t = await getTranslations("batches");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">{t("createBatch")}</h1>
        <p className="text-sm text-muted-foreground">{t("createBatchDescription")}</p>
      </div>
      <CreateBatchForm redirectPath="/admin/batches" />
    </div>
  );
}
