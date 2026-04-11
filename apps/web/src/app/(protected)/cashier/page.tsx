/**
 * Cashier/admin home — T019, T035, T036
 *
 * Shows business day status, log service CTA, and live ticket board.
 */

import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { getCurrentBusinessDay, getLastClosedBusinessDay } from "@/lib/business-day";
import { BusinessDayPanel } from "@/components/business-day-panel";
import { buttonVariants } from "@/components/ui/button";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";
import { CashierDashboard, CashierDashboardSkeleton } from "@/components/cashier-dashboard";

async function TicketBoard() {
  const result = await listOpenTickets();
  const tickets = result.success ? result.data : [];
  return <CashierDashboard initialTickets={tickets} />;
}

export default async function CashierHomePage() {
  const t = await getTranslations();

  const [currentDay, lastClosedDay] = await Promise.all([
    getCurrentBusinessDay(),
    getLastClosedBusinessDay(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("roles.cashier_admin")}</h1>
          <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
        </div>
        <Link href="/cashier/tickets/new" className={buttonVariants()}>
          <PlusIcon className="mr-2 size-4" />
          {t("tickets.logService")}
        </Link>
      </div>

      <div className="max-w-sm">
        <BusinessDayPanel currentDay={currentDay} lastClosedDay={lastClosedDay} />
      </div>

      <Suspense fallback={<CashierDashboardSkeleton />}>
        <TicketBoard />
      </Suspense>
    </div>
  );
}
