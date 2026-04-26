import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ModalShell } from "@/components/modal-shell";
import { BookAppointmentForm } from "@/components/book-appointment-form";

export default async function SecretaryNewAppointmentModal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const t = await getTranslations("appointments");

  return (
    <ModalShell title={t("bookAppointment")} maxWidth="md">
      <BookAppointmentForm redirectPath="/secretary/appointments" />
    </ModalShell>
  );
}
