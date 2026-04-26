"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PayoutStatusRow } from "./actions";

type Props = { rows: PayoutStatusRow[] };

const STATUS_TO_ENTITY: Record<PayoutStatusRow["status"], string> = {
  paid: "approved",
  pending: "awaiting_payment",
  open: "pending",
};

export function PayoutStatusGrid({ rows }: Props) {
  const t = useTranslations("payroll");

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{t("statusGridTitle")}</h2>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colDate")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.businessDayId} className="hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                <td className="px-3 py-2">
                  <StatusBadge
                    status={STATUS_TO_ENTITY[row.status]}
                    label={t(`gridStatus_${row.status}` as Parameters<typeof t>[0])}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
