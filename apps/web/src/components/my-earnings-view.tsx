import { getTranslations } from "next-intl/server";
import { getMyEarnings } from "@/app/(protected)/admin/payroll/actions";
import { notFound } from "next/navigation";

export async function MyEarningsView() {
  const t = await getTranslations("payroll");
  const result = await getMyEarnings();

  if (!result.success) {
    notFound();
  }

  const { today, thisWeek, thisMonth, payoutHistory } = result.data;

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-4xl font-bold">{t("payoutHistory")}</h1>

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
            <p className="font-mono tabular-nums font-semibold text-sm">
              ${amount.toLocaleString("es-CO")}
            </p>
          </div>
        ))}
      </div>

      {/* Payout history */}
      {payoutHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("noEarnings")}</p>
      ) : (
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
                      ${p.amount.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 capitalize">{p.method}</td>
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
