/**
 * Cashier/admin home — T019
 *
 * Shows business day status with open/close/reopen actions.
 * Full dashboard implemented in T036 and T093.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { getCurrentBusinessDay, getLastClosedBusinessDay } from "@/lib/business-day";
import { BusinessDayPanel } from "@/components/business-day-panel";
import { buttonVariants } from "@/components/ui/button";

export default async function CashierHomePage() {
  const t = await getTranslations();

  const [currentDay, lastClosedDay] = await Promise.all([
    getCurrentBusinessDay(),
    getLastClosedBusinessDay(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("roles.cashier_admin")}</h1>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </div>

      <div className="max-w-sm">
        <BusinessDayPanel currentDay={currentDay} lastClosedDay={lastClosedDay} />
      </div>

      <div>
        <Link href="/cashier/tickets/new" className={buttonVariants()}>
          <PlusIcon className="mr-2 size-4" />
          {t("tickets.logService")}
        </Link>
      </div>
    </div>
  );
}
