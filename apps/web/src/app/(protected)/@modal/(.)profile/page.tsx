import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ProfileModal() {
  const t = await getTranslations("auth");

  return (
    <ModalShell title={t("changePassword")} maxWidth="md">
      <ChangePasswordForm />
    </ModalShell>
  );
}
