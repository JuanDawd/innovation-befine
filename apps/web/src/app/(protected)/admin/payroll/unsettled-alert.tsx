"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import type { UnsettledEmployee } from "./actions";

type Props = { unsettled: UnsettledEmployee[] };

export function UnsettledAlert({ unsettled }: Props) {
  const t = useTranslations("payroll");

  if (unsettled.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 px-4 py-3">
        <CheckCircle2Icon className="h-4 w-4 shrink-0" />
        {t("allSettled")}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangleIcon className="h-4 w-4 shrink-0" />
        {t("unsettledAlert", { count: unsettled.length })}
      </div>
      <ul className="space-y-1">
        {unsettled.map((e) => (
          <li
            key={e.employeeId}
            className="text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between gap-4"
          >
            <span>
              <span className="font-medium">{e.employeeName}</span>
              {" — "}
              {t("unsettledDays", { count: e.unsettledDayCount })}
              {" ("}
              {t("since")} {e.oldestUnsettledDate}
              {")"}
            </span>
            <Link
              href={`/admin/payroll?employeeId=${e.employeeId}`}
              className="text-xs underline whitespace-nowrap"
            >
              {t("liquidate")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
