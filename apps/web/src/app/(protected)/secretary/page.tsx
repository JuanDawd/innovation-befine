/**
 * Secretary home — T035, T041
 * Full dashboard implemented in T050, T052.
 */
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LogServiceDialog } from "@/components/log-service-dialog";
import {
  listMyOpenTicketItems,
  listMyEditRequests,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { getUpcomingBirthdays } from "@/app/(protected)/clients/actions";
import { MyEditRequests, MyEditRequestsSkeleton } from "@/components/my-edit-requests";
import { UpcomingBirthdays } from "@/components/upcoming-birthdays";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { PageHeader } from "@/components/page-header";

async function EditRequestsSection() {
  const [itemsRes, requestsRes] = await Promise.all([
    listMyOpenTicketItems(),
    listMyEditRequests(),
  ]);
  return (
    <MyEditRequests
      initialItems={itemsRes.success ? itemsRes.data : []}
      initialRequests={requestsRes.success ? requestsRes.data : []}
    />
  );
}

async function BirthdaysPanel() {
  const result = await getUpcomingBirthdays(14);
  const birthdays = result.success ? result.data : [];
  return <UpcomingBirthdays birthdays={birthdays} />;
}

export default async function SecretaryHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("home.secretaryTitle")}
        description={t("home.secretarySubtitle")}
        actions={<LogServiceDialog isStylist={false} redirectPath="/secretary" />}
      />

      <Suspense fallback={<MyEditRequestsSkeleton />}>
        <EditRequestsSection />
      </Suspense>

      {/* Upcoming birthdays — 5R.9 */}
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <BirthdaysPanel />
      </Suspense>
    </div>
  );
}
