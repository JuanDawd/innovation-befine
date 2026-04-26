import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { CreateEmployeeFormPage } from "@/components/create-employee-form-page";

export default async function NewEmployeeModal() {
  const t = await getTranslations("employees");

  return (
    <ModalShell title={t("createEmployee")} maxWidth="md">
      <CreateEmployeeFormPage />
    </ModalShell>
  );
}
