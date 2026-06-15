/**
 * Admin employees page — T013, T014, T015, T022a
 *
 * Server component: loads all employees and renders the list.
 * Create button navigates to /admin/employees/new.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { EmployeeList } from "@/components/employee-list";
import { listEmployees } from "@/app/(protected)/admin/employees/actions/list-employees";

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("pageTitle")}</h1>
        <Link
          href="/admin/employees/new"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("createEmployee")}
        </Link>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        <EmployeeData />
      </Suspense>
    </div>
  );
}
