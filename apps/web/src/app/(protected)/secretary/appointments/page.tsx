/**
 * Secretary — appointments list page (T052)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { AppointmentList } from "@/components/appointment-list";

export default async function SecretaryAppointmentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const t = await getTranslations("appointments");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
      </div>
      <AppointmentList newHref="/secretary/appointments/new" />
    </div>
  );
}
