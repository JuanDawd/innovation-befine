/**
 * Secretary home — placeholder for T010.
 * Full screen implemented in T050, T052.
 */
import { getTranslations } from "next-intl/server";

export default async function SecretaryHomePage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("roles.secretary")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T050, T052)</p>
    </main>
  );
}
