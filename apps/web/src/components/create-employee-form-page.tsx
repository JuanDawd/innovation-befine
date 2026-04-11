"use client";

/**
 * CreateEmployeeFormPage — T013
 *
 * Wraps CreateEmployeeForm with toast feedback and redirect on success.
 * This is a client boundary so we can use useRouter for redirect.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CreateEmployeeForm } from "@/components/create-employee-form";

export function CreateEmployeeFormPage() {
  const router = useRouter();
  const t = useTranslations("employees");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleSuccess({ name }: { name: string; email: string }) {
    setSuccessMsg(`${t("createSuccess")} — ${name}`);
    // Brief delay so user sees the success message, then redirect
    setTimeout(() => router.push("/admin/employees"), 1500);
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      {successMsg && (
        <div
          role="status"
          className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
        >
          {successMsg}
        </div>
      )}
      <CreateEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
