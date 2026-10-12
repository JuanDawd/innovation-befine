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
      <div className="flex items-center gap-2 text-sm text-status-success-foreground rounded-md border border-status-success-foreground/30 bg-status-success px-4 py-3">
        <CheckCircle2Icon className="size-4 shrink-0" />
        {t("allSettled")}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-status-attention-foreground/30 bg-status-attention px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-status-attention-foreground">
        <AlertTriangleIcon className="size-4 shrink-0" />
        {t("unsettledAlert", { count: unsettled.length })}
      </div>
      <ul className="space-y-1">
        {unsettled.map((e) => (
          <li
            key={e.employeeId}
            className="text-sm text-status-attention-foreground flex items-center justify-between gap-4"
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
