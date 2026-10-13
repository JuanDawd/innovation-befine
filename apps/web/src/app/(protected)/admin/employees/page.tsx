/**
 * Admin employees page — T013, T014, T015, T022a
 *
 * Server component: loads all employees and renders the list.
 * Create button navigates to /admin/employees/new.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { EmployeeList } from "@/components/employee-list";
import { listEmployees } from "@/app/(protected)/admin/employees/actions/list-employees";
import { NewEmployeeDialog } from "@/components/new-employee-dialog";
import { PageHeader } from "@/components/page-header";

async function EmployeeData() {
  const result = await listEmployees();
  const employees = result.success ? result.data : [];

  return <EmployeeList initialEmployees={employees} />;
}

export default async function EmployeesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "admin")) redirect("/admin");

  const t = await getTranslations("employees");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} actions={<NewEmployeeDialog />} />

      <Suspense fallback={<PageSkeleton />}>
        <EmployeeData />
      </Suspense>
    </div>
  );
}
