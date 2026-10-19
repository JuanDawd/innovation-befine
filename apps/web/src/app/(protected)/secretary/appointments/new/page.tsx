import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { NewAppointmentContent } from "../new-content";

/** Full-page version of the creation modal, for direct links and refreshes. */
export default async function SecretaryNewAppointmentPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("appointments.bookAppointment")}
        backHref="/secretary/appointments"
        backLabel={t("common.back")}
      />
      <NewAppointmentContent />
    </div>
  );
}
