/**
 * Create employee page — T013
 *
 * Full-page form for admin to create a new employee.
 * After successful creation, redirects to the employee list.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { CreateEmployeeFormPage } from "@/components/create-employee-form-page";

export default async function NewEmployeePage() {
  const t = await getTranslations("employees");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/employees"
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Volver"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{t("createEmployee")}</h1>
          <p className="text-sm text-muted-foreground">{t("createEmployeeDescription")}</p>
        </div>
      </div>

      <CreateEmployeeFormPage />
    </div>
  );
}
