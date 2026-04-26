/**
 * Profile / settings page — T091
 *
 * Accessible to all authenticated roles via /profile.
 * Currently shows the self-service password change form.
 */

import { getTranslations } from "next-intl/server";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ProfilePage() {
  const t = await getTranslations("auth");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">{t("changePassword")}</h1>
        <p className="text-sm text-muted-foreground">{t("resetPasswordDescription")}</p>
      </div>

      <div className="max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
