/**
 * Clothier home — T046
 *
 * Shows today's assigned pieces and unassigned (claimable) pieces.
 * Mobile-first, checklist style with progress bar.
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "clothier")) redirect("/login");

  const emp = await getEmployeeRef(session.user.id);

  if (!emp) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title={t("pageTitle")} className="px-4 pt-6 pb-2" />
      <ClothierWorkBoard employeeId={emp.id} />
    </div>
  );
}
