/**
 * Secretary home — placeholder.
 * Full screen implemented in T050, T052.
 */
import { getTranslations } from "next-intl/server";

export default async function SecretaryHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">{t("roles.secretary")}</h1>
      <p className="text-sm text-muted-foreground">Panel — coming soon (T050, T052)</p>
    </div>
  );
}
