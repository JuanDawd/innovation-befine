import { getTranslations } from "next-intl/server";
import { getMyEarnings } from "@/app/(protected)/admin/payroll/actions";
import { redirect } from "next/navigation";
import { formatMoney } from "@/i18n";
import { PageHeader } from "@/components/page-header";

export async function MyEarningsView({ roleHome }: { roleHome: string }) {
  const [t, tNav] = await Promise.all([getTranslations("payroll"), getTranslations("nav")]);
  const result = await getMyEarnings();

  if (!result.success) {
    redirect(roleHome);
  }

  const { today, thisWeek, thisMonth, payoutHistory } = result.data;
  const hasCurrentEarnings = today > 0 || thisWeek > 0 || thisMonth > 0;

  const totals = [
    { label: t("todayEarnings"), amount: today },
    { label: t("weekEarnings"), amount: thisWeek },
    { label: t("monthEarnings"), amount: thisMonth },
  ] as const;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={tNav("myEarnings")} />

      {/* Totals — one strip, same numerals as the cashier summary */}
      <section
        aria-label={tNav("myEarnings")}
        className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border"
      >
        {totals.map(({ label, amount }) => (
          <div key={label} className="flex min-w-0 flex-col gap-1.5 bg-card p-3 sm:p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="truncate font-display text-xl font-light leading-none tracking-[-0.02em] tabular-nums sm:text-2xl">
              {formatMoney(amount)}
            </p>
          </div>
        ))}
      </section>

      {!hasCurrentEarnings && (
        <p className="-mt-3 text-sm text-muted-foreground">
          {payoutHistory.length === 0 ? t("noEarnings") : t("noMovementsThisPeriod")}
        </p>
      )}

      {/* Payout history */}
      {payoutHistory.length > 0 && (
        <section aria-labelledby="payout-history" className="flex flex-col gap-2">
          <h2 id="payout-history" className="text-lg font-semibold">
            {t("payoutHistory")}
          </h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">{t("colDate")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colAmount")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("colMethod")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payoutHistory.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {new Date(p.paidAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium tabular-nums">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-4 py-2.5">{t.has(p.method) ? t(p.method) : p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
