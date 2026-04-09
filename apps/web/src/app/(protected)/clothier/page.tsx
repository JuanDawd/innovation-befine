/**
 * Clothier home — placeholder for T010.
 * Full screen implemented in T046.
 */
import { getTranslations } from "next-intl/server";

export default async function ClothierHomePage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("roles.clothier")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T046)</p>
    </main>
  );
}
