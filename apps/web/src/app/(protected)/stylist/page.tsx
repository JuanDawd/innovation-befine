/**
 * Stylist home — placeholder for T010.
 * Full screen implemented in T035.
 */
import { getTranslations } from "next-intl/server";

export default async function StylistHomePage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("roles.stylist")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T035)</p>
    </main>
  );
}
