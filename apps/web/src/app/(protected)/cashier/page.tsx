/**
 * Cashier/admin home — placeholder for T010.
 * Full dashboard implemented in T036 and T093.
 */
import { getTranslations } from "next-intl/server";

export default async function CashierHomePage() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("roles.cashier_admin")}</h1>
      <p className="text-sm text-muted-foreground">Dashboard — coming soon (T036, T093)</p>
    </main>
  );
}
