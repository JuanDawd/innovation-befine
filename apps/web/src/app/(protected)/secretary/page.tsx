/**
 * Secretary home — the front desk. Leads with what needs her next: the day's
 * remaining appointments, units to review and pedidos due; then today's
 * services (everyone's, with the stylist named) and upcoming birthdays.
 */
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { LogServiceDialog } from "@/components/log-service-dialog";
import {
  listMyOpenTicketItems,
  listMyEditRequests,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { getUpcomingBirthdays } from "@/app/(protected)/clients/actions";
import { listPedidos } from "@/app/(protected)/pedidos/actions";
import type { PedidoListItem } from "@befine/db";
import { MyEditRequests, MyEditRequestsSkeleton } from "@/components/my-edit-requests";
import { UpcomingBirthdays } from "@/components/upcoming-birthdays";
import {
  ApprovalsWaitingPanel,
  OrdersDuePanel,
  UpcomingAppointmentsPanel,
} from "@/components/front-desk-panels";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { PageHeader } from "@/components/page-header";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function EditRequestsSection() {
  const [itemsRes, requestsRes] = await Promise.all([
    listMyOpenTicketItems(),
    listMyEditRequests(),
  ]);
  return (
    <MyEditRequests
      frontDesk
      initialItems={itemsRes.success ? itemsRes.data : []}
      initialRequests={requestsRes.success ? requestsRes.data : []}
    />
  );
}

/** Client pedidos ready to hand over, or due within a week — soonest first. */
function ordersDueSoon(pedidos: PedidoListItem[]): PedidoListItem[] {
  const horizon = new Date(Date.now() + WEEK_MS).toLocaleDateString("en-CA", {
    timeZone: "America/Bogota",
  });
  const open = ["pending", "in_production", "ready", "partially_delivered"];
  return pedidos
    .filter(
      (p) =>
        p.destination === "client" &&
        open.includes(p.status) &&
        (p.status === "ready" ||
          (p.estimatedDeliveryDate !== null && p.estimatedDeliveryDate <= horizon)),
    )
    .sort((a, b) => (a.estimatedDeliveryDate ?? "9").localeCompare(b.estimatedDeliveryDate ?? "9"))
    .slice(0, 5);
}

async function OrdersDueSection() {
  const result = await listPedidos({ destination: "client" });
  return <OrdersDuePanel orders={ordersDueSoon(result.success ? result.data : [])} />;
}

async function BirthdaysPanel() {
  const result = await getUpcomingBirthdays(14);
  const birthdays = result.success ? result.data : [];
  return <UpcomingBirthdays birthdays={birthdays} />;
}

export default async function SecretaryHomePage() {
  const [t, format] = await Promise.all([getTranslations("frontDesk"), getFormatter()]);
  const today = format.dateTime(new Date(), {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("pageTitle")}
        description={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={<LogServiceDialog isStylist={false} redirectPath="/secretary" />}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <UpcomingAppointmentsPanel />
          {/* Phones: the approvals count right after the agenda, not under the services */}
          <div className="lg:hidden">
            <ApprovalsWaitingPanel />
          </div>
          <Suspense fallback={<MyEditRequestsSkeleton />}>
            <EditRequestsSection />
          </Suspense>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <div className="max-lg:hidden">
            <ApprovalsWaitingPanel />
          </div>
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-xl" />}>
            <OrdersDueSection />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <BirthdaysPanel />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
