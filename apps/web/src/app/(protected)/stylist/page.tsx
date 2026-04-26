/**
 * Stylist home — T035, T041
 */
import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  listMyOpenTicketItems,
  listMyEditRequests,
} from "@/app/(protected)/tickets/edit-requests/actions";
import { MyEditRequests, MyEditRequestsSkeleton } from "@/components/my-edit-requests";

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

export default async function StylistHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{t("roles.stylist")}</h1>
          <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
        </div>
        <Link href="/stylist/tickets/new" className={buttonVariants()}>
          <PlusIcon className="mr-2 size-4" aria-hidden="true" />
          {t("tickets.logService")}
        </Link>
      </div>

      <Suspense fallback={<MyEditRequestsSkeleton />}>
        <EditRequestsSection />
      </Suspense>
    </div>
  );
}
