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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-md mx-auto w-full">
      <PageHeader title={tNav("myEarnings")} />

      {!hasCurrentEarnings && payoutHistory.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">{t("noEarnings")}</p>
      )}

      {!hasCurrentEarnings && payoutHistory.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("noMovementsThisPeriod")}
        </p>
      )}

      {/* Summary cards — mobile-first */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { label: t("todayEarnings"), amount: today },
            { label: t("weekEarnings"), amount: thisWeek },
            { label: t("monthEarnings"), amount: thisMonth },
          ] as const
        ).map(({ label, amount }) => (
          <div key={label} className="rounded-md border p-3 space-y-1 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono tabular-nums font-semibold text-sm">{formatMoney(amount)}</p>
          </div>
        ))}
      </div>

      {/* Payout history */}
      {payoutHistory.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{t("payoutHistory")}</h2>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("colDate")}</th>
                  <th className="px-3 py-2 text-right font-medium font-mono">{t("colAmount")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("colMethod")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payoutHistory.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {new Date(p.paidAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-3 py-2">{t.has(p.method) ? t(p.method) : p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
