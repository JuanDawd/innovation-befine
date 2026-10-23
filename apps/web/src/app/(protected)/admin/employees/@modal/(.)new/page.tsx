import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { NewEmployeeContent } from "../../new-content";

export default async function NewEmployeeModal() {
  const t = await getTranslations("employees");
  return (
    <ModalShell title={t("createEmployee")} maxWidth="md">
      <NewEmployeeContent />
    </ModalShell>
  );
}
