/**
 * Cashier/admin home — placeholder.
 * Full dashboard implemented in T036 and T093.
 */
import { getTranslations } from "next-intl/server";

export default async function CashierHomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">{t("roles.cashier_admin")}</h1>
      <p className="text-sm text-muted-foreground">Dashboard — coming soon (T036, T093)</p>
    </div>
  );
}
