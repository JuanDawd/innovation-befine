import { getFormatter, getTranslations } from "next-intl/server";
import { getMyEarnings } from "@/app/(protected)/admin/payroll/actions";
import { redirect } from "next/navigation";
import { formatMoney } from "@/i18n";
import { PageHeader } from "@/components/page-header";

export async function MyEarningsView({ roleHome }: { roleHome: string }) {
  const [t, tNav, format] = await Promise.all([
    getTranslations("payroll"),
    getTranslations("nav"),
    getFormatter(),
  ]);
  const result = await getMyEarnings();

  if (!result.success) {
    redirect(roleHome);
  }

  const { today, thisWeek, thisMonth, inProgress, todayLines, payoutHistory } = result.data;
  const hasCurrentEarnings = today > 0 || thisWeek > 0 || thisMonth > 0;

  const totals = [
    { label: t("todayEarnings"), amount: today },
    { label: t("weekEarnings"), amount: thisWeek },
    { label: t("monthEarnings"), amount: thisMonth },
  ] as const;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={tNav("myEarnings")} />

      <div className="flex flex-col gap-2">
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

        {inProgress !== null && inProgress > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("inProgressNote", { amount: formatMoney(inProgress) })}
          </p>
        )}
        {inProgress !== null && today === 0 && (
          <p className="text-sm text-muted-foreground">{t("noEarningsToday")}</p>
        )}
        {inProgress === null && !hasCurrentEarnings && (
          <p className="text-sm text-muted-foreground">
            {payoutHistory.length === 0 ? t("noEarnings") : t("noMovementsThisPeriod")}
          </p>
        )}
      </div>

      {/* What "Hoy" is made of */}
      {todayLines.length > 0 && (
        <section aria-labelledby="today-detail" className="flex flex-col gap-2">
          <h2 id="today-detail" className="text-lg font-semibold">
            {t("todayDetail")}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
            {todayLines.map((line, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {line.label}
                    {line.basis.kind === "commission" && line.quantity > 1
                      ? ` × ${line.quantity}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {line.basis.kind === "commission"
                      ? t("lineCommission", {
                          pct: line.basis.pct,
                          price: formatMoney(line.basis.price),
                        })
                      : t("linePieceRate", {
                          quantity: line.quantity,
                          rate: formatMoney(line.basis.rate),
                        })}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                  {formatMoney(line.amount)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Payout history — newest first */}
      {payoutHistory.length > 0 && (
        <section aria-labelledby="payout-history" className="flex flex-col gap-2">
          <h2 id="payout-history" className="text-lg font-semibold">
            {t("payoutHistory")}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border bg-card">
            {payoutHistory.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm tabular-nums">
                    {format.dateTime(new Date(p.paidAt), {
                      timeZone: "America/Bogota",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.has(p.method) ? t(p.method) : p.method}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                  {formatMoney(p.amount)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
