/**
 * Login page — T016
 *
 * Server component wrapper. The form itself is a client component
 * (requires Better Auth signIn, React Hook Form state).
 */
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-logo";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <BrandLogo className="scale-150" />
          <p className="text-sm text-muted-foreground">{t("auth.login")}</p>
        </div>

        {/* Login form */}
        <LoginForm />
      </div>
    </main>
  );
}
