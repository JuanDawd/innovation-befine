/**
 * Closed ticket history — T092
 *
 * Admin/cashier view of all closed tickets for any business day.
 * Defaults to today's (most recent) business day.
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ReceiptIcon } from "lucide-react";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { ClosedTicketHistory } from "@/components/closed-ticket-history";
import { listBusinessDays, listClosedTickets } from "./actions";

async function HistoryContent() {
  const daysResult = await listBusinessDays();

  const days = daysResult.success ? daysResult.data : [];
  const todayDay = days[0] ?? null;

  const ticketsResult = todayDay
    ? await listClosedTickets(todayDay.id)
    : { success: true as const, data: [] };

  const initialTickets = ticketsResult.success ? ticketsResult.data : [];

  if (days.length === 0) {
    const t = await getTranslations("ticketHistory");
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <ReceiptIcon className="size-12 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("noDays")}</p>
      </div>
    );
  }

  return (
    <ClosedTicketHistory
      businessDays={days}
      initialDayId={todayDay!.id}
      initialTickets={initialTickets}
    />
  );
}

export default async function TicketHistoryPage() {
  const t = await getTranslations("ticketHistory");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}
