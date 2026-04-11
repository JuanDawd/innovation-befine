/**
 * Reset password page — T017
 *
 * Two states:
 * - No token: "forgot password" form — user enters email, we send a reset link
 * - Token present: "set new password" form — user enters new password
 *
 * Better Auth handles token generation/validation on the server.
 */

import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SetNewPasswordForm } from "@/components/set-new-password-form";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const t = await getTranslations("auth");
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">
            {token ? t("resetPasswordTitle") : t("forgotPasswordTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {token ? t("resetPasswordDescription") : t("forgotPasswordDescription")}
          </p>
        </div>

        {token ? <SetNewPasswordForm token={token} /> : <ForgotPasswordForm />}
      </div>
    </main>
  );
}
