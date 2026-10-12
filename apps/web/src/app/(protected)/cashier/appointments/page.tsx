/**
 * Cashier — appointments list page (T052)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { AppointmentList } from "@/components/appointment-list";
import { PageHeader } from "@/components/page-header";

export default async function CashierAppointmentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier", "admin")) redirect("/cashier");

  const t = await getTranslations("appointments");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} />
      <AppointmentList />
    </div>
  );
}
