/**
 * Stylist home — placeholder.
 * Full screen implemented in T035.
 */
import { getTranslations } from "next-intl/server";

export default async function StylistHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">{t("roles.stylist")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T035)</p>
    </div>
  );
}
