/**
 * Stylist home — T035
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default async function StylistHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("roles.stylist")}</h1>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </div>
      <div>
        <Link href="/stylist/tickets/new" className={buttonVariants()}>
          <PlusIcon className="mr-2 size-4" />
          {t("tickets.logService")}
        </Link>
      </div>
    </div>
  );
}
