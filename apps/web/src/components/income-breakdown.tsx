"use client";

/**
 * IncomeBreakdown — T130 (spec §3.5.22)
 *
 * The day's till by source (Servicios · Pedidos · Prendas) and by method,
 * with the after-hours line. Used in the close-day dialog; `compact` is the
 * one-line split under "Ingresos hoy" in the summary strip.
 */

import { useTranslations } from "next-intl";
import { MoonIcon } from "lucide-react";
import type { DayIncome, IncomeSource, PaymentMethodKey } from "@befine/db/day-income";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";

const SOURCES: IncomeSource[] = ["services", "pedidos", "prendas"];
const METHODS: PaymentMethodKey[] = ["cash", "card", "transfer", "unknown"];

export function IncomeBreakdown({
  income,
  compact = false,
  className,
}: {
  income: DayIncome;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("dayIncome");

  if (compact)
    return (
      <p className={cn("text-xs text-muted-foreground", className)} suppressHydrationWarning>
        {SOURCES.map(
          (src) => `${t(`sources.${src}`)} ${formatMoney(income.bySource[src].total)}`,
        ).join(" · ")}
        {income.afterHours.count > 0 &&
          ` · ${t("afterHoursShort", { amount: formatMoney(income.afterHours.total) })}`}
      </p>
    );

  const methods = METHODS.filter((m) => m !== "unknown" || income.byMethod.unknown !== 0);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("source")}
              </th>
              {methods.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                >
                  {t(`methods.${m}`)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("total")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {SOURCES.map((src) => {
              const row = income.bySource[src];
              return (
                <tr key={src}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {t(`sources.${src}`)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t("count", { count: row.count })}
                    </span>
                  </th>
                  {methods.map((m) => (
                    <td
                      key={m}
                      className="hidden px-3 py-2 text-right font-mono tabular-nums text-muted-foreground sm:table-cell"
                    >
                      {row.byMethod[m] === 0 ? "—" : formatMoney(row.byMethod[m])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-medium tabular-nums">
                    {formatMoney(row.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 bg-muted/30">
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-semibold">
                {t("total")}
              </th>
              {methods.map((m) => (
                <td
                  key={m}
                  className="hidden px-3 py-2 text-right font-mono font-medium tabular-nums sm:table-cell"
                >
                  {formatMoney(income.byMethod[m])}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                {formatMoney(income.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {/* On phones the method columns are hidden: show the per-method totals as a list. */}
      <dl className="grid grid-cols-3 gap-2 text-xs sm:hidden">
        {methods.map((m) => (
          <div key={m} className="rounded-md bg-muted/40 px-2 py-1.5">
            <dt className="text-muted-foreground">{t(`methods.${m}`)}</dt>
            <dd className="font-mono font-medium tabular-nums">
              {formatMoney(income.byMethod[m])}
            </dd>
          </div>
        ))}
      </dl>
      {income.afterHours.count > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <MoonIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-medium">
              {t("afterHoursTitle", { amount: formatMoney(income.afterHours.total) })}
            </span>{" "}
            <span className="text-muted-foreground">
              {t("afterHoursDetail", {
                count: income.afterHours.count,
                pedidos: formatMoney(income.afterHours.pedidos),
                prendas: formatMoney(income.afterHours.prendas),
              })}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
