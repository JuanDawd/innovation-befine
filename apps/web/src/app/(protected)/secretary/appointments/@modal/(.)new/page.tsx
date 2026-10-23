import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { NewAppointmentContent } from "../../new-content";

export default async function SecretaryNewAppointmentModal() {
  const t = await getTranslations("appointments");
  return (
    <ModalShell title={t("bookAppointment")} maxWidth="md">
      <NewAppointmentContent />
    </ModalShell>
  );
}
