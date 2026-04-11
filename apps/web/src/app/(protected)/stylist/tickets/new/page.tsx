/**
 * Stylist — log service page (T035)
 * Stylist logs a ticket for themselves. Employee selector hidden.
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentEmployeeId } from "@/app/(protected)/tickets/actions";
import { LogServiceForm } from "@/components/log-service-form";

export default async function StylistLogServicePage() {
  const t = await getTranslations("tickets");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "stylist")) redirect("/stylist");

  const empResult = await getCurrentEmployeeId();
  if (!empResult.success) redirect("/stylist");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold">{t("logService")}</h1>
        <p className="text-sm text-muted-foreground">{t("logServiceDescription")}</p>
      </div>
      <LogServiceForm
        currentEmployeeId={empResult.data.employeeId}
        isStylist={true}
        redirectPath="/stylist"
      />
    </div>
  );
}
