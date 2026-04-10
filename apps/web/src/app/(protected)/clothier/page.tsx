/**
 * Clothier home — placeholder.
 * Full screen implemented in T046.
 */
import { getTranslations } from "next-intl/server";

export default async function ClothierHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">{t("roles.clothier")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T046)</p>
    </div>
  );
}
