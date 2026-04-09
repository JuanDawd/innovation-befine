/**
 * Login page — placeholder for T010.
 * Full implementation (form, validation, Better Auth sign-in) is T016.
 */
import { getTranslations } from "next-intl/server";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{t("common.appName")}</h1>
        <p className="text-muted-foreground">{t("auth.login")}</p>
        {/* Full login form implemented in T016 */}
      </div>
    </main>
  );
}
