/**
 * Cashier — log service page (T035)
 * cashier_admin can log a ticket for any active stylist.
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getCurrentEmployeeId } from "@/app/(protected)/tickets/actions";
import { LogServiceForm } from "@/components/log-service-form";

export default async function CashierLogServicePage() {
  const t = await getTranslations("tickets");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  const empResult = await getCurrentEmployeeId();
  const currentEmployeeId = empResult.success ? empResult.data.employeeId : "";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">{t("logService")}</h1>
        <p className="text-sm text-muted-foreground">{t("logServiceDescription")}</p>
      </div>
      <LogServiceForm
        currentEmployeeId={currentEmployeeId}
        isStylist={false}
        redirectPath="/cashier"
      />
    </div>
  );
}
