/**
 * Cashier/admin home — T019, T035, T036, T041, T093
 *
 * Shows:
 * - Business day status panel
 * - Day-at-a-glance stats (revenue, open ticket count, quick actions) — T093
 * - Pending edit requests panel — T041
 * - Live ticket board
 */

import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlusIcon, CreditCardIcon } from "lucide-react";
import { getCurrentBusinessDay, getLastClosedBusinessDay } from "@/lib/business-day";
import { BusinessDayPanel } from "@/components/business-day-panel";
import { buttonVariants } from "@/components/ui/button-variants";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";
import { listPendingEditRequests } from "@/app/(protected)/tickets/edit-requests/actions";
import { getDayStats } from "@/app/(protected)/cashier/actions/day-stats";
import { CashierDashboard, CashierDashboardSkeleton } from "@/components/cashier-dashboard";
import {
  PendingEditRequests,
  PendingEditRequestsSkeleton,
} from "@/components/pending-edit-requests";
import { DayAtAGlance } from "@/components/day-at-a-glance";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/loading-skeleton";

async function EditRequestsPanel() {
  const result = await listPendingEditRequests();
  const requests = result.success ? result.data : [];
  return <PendingEditRequests initialRequests={requests} />;
}

async function StatsAndBoard() {
  const [openResult, statsResult] = await Promise.all([listOpenTickets(), getDayStats()]);

  const openTickets = openResult.success ? openResult.data : [];
  const stats = statsResult.success
    ? statsResult.data
    : { revenue: 0, closedCount: 0, businessDayId: null };

  return (
    <>
      <DayAtAGlance
        revenue={stats.revenue}
        closedCount={stats.closedCount}
        initialOpenCount={openTickets.length}
        isDayOpen={stats.businessDayId !== null}
      />
      <CashierDashboard initialTickets={openTickets} />
    </>
  );
}

function StatsAndBoardSkeleton() {
  return (
    <>
      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 border-t border-border pt-5 pr-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      {/* Board skeleton */}
      <CashierDashboardSkeleton />
    </>
  );
}

export default async function CashierHomePage() {
  const t = await getTranslations();

  const [currentDay, lastClosedDay] = await Promise.all([
    getCurrentBusinessDay(),
    getLastClosedBusinessDay(),
  ]);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        crumbs={["Innovations", "Befine", t("roles.cashier_admin")]}
        title={
          <>
            {t("roles.cashier_admin")}
            <em>.</em>
          </>
        }
        subtitle={t("home.subtitle")}
        actions={
          <>
            <Link href="/cashier/tickets/new" className={buttonVariants({ variant: "outline" })}>
              <PlusIcon className="mr-2 size-4" aria-hidden="true" />
              {t("tickets.logService")}
            </Link>
            <Link href="/cashier/checkout" className={buttonVariants()}>
              <CreditCardIcon className="mr-2 size-4" aria-hidden="true" />
              {t("dayAtAGlance.actionCheckout")}
            </Link>
          </>
        }
      />
      {/* Business day panel */}
      <div className="max-w-sm">
        <BusinessDayPanel currentDay={currentDay} lastClosedDay={lastClosedDay} />
      </div>
      {/* Pending edit requests — T041 */}
      <Suspense fallback={<PendingEditRequestsSkeleton />}>
        <EditRequestsPanel />
      </Suspense>
      {/* Day-at-a-glance stats + ticket board */}
      <Suspense fallback={<StatsAndBoardSkeleton />}>
        <StatsAndBoard />
      </Suspense>
    </div>
  );
}
