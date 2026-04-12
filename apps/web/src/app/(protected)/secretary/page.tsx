/**
 * Secretary home — T035
 * Full dashboard implemented in T050, T052.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

export default async function SecretaryHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("roles.secretary")}</h1>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </div>
      <div>
        <Link href="/secretary/tickets/new" className={buttonVariants()}>
          <PlusIcon className="mr-2 size-4" />
          {t("tickets.logService")}
        </Link>
      </div>
    </div>
  );
}
