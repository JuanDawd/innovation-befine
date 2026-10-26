/**
 * Cashier/admin home — T019, T035, T036, T041, T093
 *
 * Reading order follows the front desk's job:
 * - Header: day status (badge + date/opening line) and the day's actions
 * - Summary strip led by "Por cobrar" — T093
 * - Live ticket board, grouped by status
 * - Side rail (≥1280px): pending edit requests — T041 — and upcoming birthdays.
 *   Below that width the rail stacks above the board and only shows sections
 *   that have something in them.
 *
 * Failed reads are passed down as `*Failed` flags so the client retries and
 * shows an error, instead of rendering an empty list or "day not open".
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CalendarCheckIcon } from "lucide-react";
import { getCurrentBusinessDay, getLastClosedBusinessDay } from "@/lib/business-day";
import {
  BusinessDayActions,
  BusinessDayStatusBadge,
  BusinessDayStatusLine,
} from "@/components/business-day-panel";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";
import { listPendingEditRequests } from "@/app/(protected)/tickets/edit-requests/actions";
import { getDayStats } from "@/app/(protected)/cashier/actions/day-stats";
import { getUpcomingBirthdays } from "@/app/(protected)/clients/actions";
import { CashierDashboard, CashierDashboardSkeleton } from "@/components/cashier-dashboard";
import {
  PendingEditRequests,
  PendingEditRequestsSkeleton,
} from "@/components/pending-edit-requests";
import { DayAtAGlance, DayAtAGlanceSkeleton } from "@/components/day-at-a-glance";
import { PageHeader } from "@/components/page-header";
import { summarizeDayIncome } from "@befine/db/day-income";
import { EmptyState } from "@/components/ui/empty-state";
import { UpcomingBirthdays } from "@/components/upcoming-birthdays";

async function EditRequestsPanel() {
  const result = await listPendingEditRequests();
  return (
    <PendingEditRequests
      initialRequests={result.success ? result.data : []}
      loadFailed={!result.success}
    />
  );
}

async function BirthdaysPanel() {
  const result = await getUpcomingBirthdays(14);
  // Birthdays are a courtesy, not an operation: on failure the section stays hidden.
  if (!result.success) return null;
  return <UpcomingBirthdays birthdays={result.data} />;
}

async function StatsAndBoard() {
  const [openResult, statsResult] = await Promise.all([listOpenTickets(), getDayStats()]);

  const openTickets = openResult.success ? openResult.data : [];
  const stats = statsResult.success
    ? statsResult.data
    : { revenue: 0, income: summarizeDayIncome([]), closedCount: 0, businessDayId: null };

  return (
    <>
      <DayAtAGlance
        initialStats={stats}
        initialOpenTickets={openTickets}
        statsFailed={!statsResult.success}
        ticketsFailed={!openResult.success}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-8">
        <CashierDashboard initialTickets={openTickets} loadFailed={!openResult.success} />
        <SideRail />
      </div>
    </>
  );
}

async function SideRail() {
  const t = await getTranslations("cashierBoard");
  return (
    <aside
      aria-label={t("pendingAside")}
      className="order-first flex flex-col gap-6 xl:sticky xl:top-8 xl:order-none xl:border-l xl:pl-8"
    >
      <Suspense fallback={<PendingEditRequestsSkeleton />}>
        <EditRequestsPanel />
      </Suspense>
      <Suspense fallback={null}>
        <BirthdaysPanel />
      </Suspense>
    </aside>
  );
}

function StatsAndBoardSkeleton() {
  return (
    <>
      <DayAtAGlanceSkeleton />
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
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("home.cashierTitle")}
        meta={<BusinessDayStatusBadge currentDay={currentDay} />}
        description={
          <BusinessDayStatusLine currentDay={currentDay} lastClosedDay={lastClosedDay} />
        }
        actions={<BusinessDayActions currentDay={currentDay} lastClosedDay={lastClosedDay} />}
      />

      {currentDay ? (
        <Suspense fallback={<StatsAndBoardSkeleton />}>
          <StatsAndBoard />
        </Suspense>
      ) : (
        <EmptyState
          icon={CalendarCheckIcon}
          title={t("dayAtAGlance.noDayOpenTitle")}
          description={t("dayAtAGlance.noDayOpenDescription")}
          className="rounded-xl border border-dashed"
        />
      )}
    </div>
  );
}
