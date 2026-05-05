import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { CraftableApprovalBoard } from "@/components/craftable-approval-board";
import { CraftablesDashboardTable } from "@/components/craftables-dashboard-table";

export default async function SecretaryCraftablesPage() {
  const t = await getTranslations("craftables");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("pageTitle")}</h1>
        <Link href="/secretary/craftables/new" className={cn(buttonVariants())}>
          <PlusIcon className="h-4 w-4 mr-2" />
          {t("createCraftable")}
        </Link>
      </div>
      <CraftablesDashboardTable isAdmin={false} />
      <CraftableApprovalBoard isAdmin={false} />
    </div>
  );
}
