"use client";

/**
 * CreateEmployeeFormPage — T013
 *
 * Wraps CreateEmployeeForm with toast feedback and redirect on success.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CreateEmployeeForm } from "@/components/create-employee-form";

export function CreateEmployeeFormPage() {
  const router = useRouter();
  const t = useTranslations("employees");

  function handleSuccess({ name }: { name: string; email: string }) {
    toast.success(`${t("createSuccess")} — ${name}`);
    setTimeout(() => router.push("/admin/employees"), 1000);
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <CreateEmployeeForm onSuccess={handleSuccess} />
    </div>
  );
}
