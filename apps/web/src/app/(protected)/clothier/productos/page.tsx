/**
 * Clothier products board — T046 (moved from /clothier by T123)
 *
 * The previous products model, kept until T135 retires it. Mi trabajo
 * (pedidos) is the clothier home now.
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ClothierWorkBoard } from "@/components/clothier-work-board";
import { PageHeader } from "@/components/page-header";
import { getEmployeeRef } from "@/lib/employee-ref";

export default async function ClothierHomePage() {
  const t = await getTranslations("clothierWork");
  const tc = await getTranslations("common");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "clothier")) redirect("/login");

  const emp = await getEmployeeRef(session.user.id);

  if (!emp) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title={t("pageTitle")}
        backHref="/clothier"
        backLabel={tc("back")}
        className="px-4 pt-6 pb-2"
      />
      <ClothierWorkBoard employeeId={emp.id} />
    </div>
  );
}
