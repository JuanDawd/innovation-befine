/**
 * Login page — T016
 *
 * Server component wrapper. The form itself is a client component
 * (requires Better Auth signIn, React Hook Form state).
 */
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">{t("common.appName")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.login")}</p>
        </div>

        {/* Login form */}
        <LoginForm />
      </div>
    </main>
  );
}
