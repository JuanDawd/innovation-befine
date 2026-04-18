/**
 * Secretary — cloth batches list (T045)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function SecretaryBatchesPage() {
  const t = await getTranslations("batches");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <Link href="/secretary/batches/new" className={cn(buttonVariants())}>
          <PlusIcon className="h-4 w-4 mr-2" />
          {t("createBatch")}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
    </div>
  );
}
