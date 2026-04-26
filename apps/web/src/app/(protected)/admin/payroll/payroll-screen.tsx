"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, CheckIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  previewEarnings,
  recordPayout,
  type BusinessDayOption,
  type EarningsPreview,
  type PayoutRow,
} from "./actions";
import type { EmployeeOption } from "../absences/actions";

type Props = {
  days: BusinessDayOption[];
  employees: EmployeeOption[];
  history: PayoutRow[];
  initialEmployeeId?: string;
};

export function PayrollScreen({ days, employees, history, initialEmployeeId }: Props) {
  const t = useTranslations("payroll");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Stable idempotency key per preview session — refreshed after each successful record
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [selectedEmployee, setSelectedEmployee] = useState(initialEmployeeId ?? "");
  // Pre-select the most-recent unsettled closed day for the chosen employee
  // so the cashier doesn't have to hunt for it. `days` is already
  // employee-scoped server-side; the next pick triggers a router refresh
  // which remounts this component with fresh employee-scoped data.
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => {
    if (!initialEmployeeId) return new Set();
    const latestUnsettled = [...days].reverse().find((d) => !d.isSettled);
    return latestUnsettled ? new Set([latestUnsettled.id]) : new Set();
  });
  const [preview, setPreview] = useState<EarningsPreview | null>(null);
  const [adjustedAmount, setAdjustedAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleDay(id: string) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setPreview(null);
    setSuccess(false);
  }

  function handlePreview() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewEarnings(selectedEmployee, Array.from(selectedDays));
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setPreview(res.data);
      setAdjustedAmount(String(res.data.computedAmount));
    });
  }

  function handleRecord() {
    setError(null);
    if (!preview) return;
    startTransition(async () => {
      const finalAmount = parseInt(adjustedAmount, 10);
      if (isNaN(finalAmount) || finalAmount < 0) {
        setError(t("invalidAmount"));
        return;
      }
      const res = await recordPayout({
        idempotencyKey: idempotencyKeyRef.current,
        employeeId: preview.employeeId,
        businessDayIds: preview.businessDayIds,
        amount: finalAmount,
        originalComputedAmount: preview.computedAmount,
        adjustmentReason: adjustmentReason.trim() || undefined,
        method,
        notes: notes.trim() || undefined,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setSuccess(true);
      setPreview(null);
      setSelectedDays(new Set());
      setAdjustedAmount("");
      setAdjustmentReason("");
      setNotes("");
      // Rotate idempotency key so next payout gets a fresh one
      idempotencyKeyRef.current = crypto.randomUUID();
      router.refresh();
    });
  }

  const unsettledDays = days.filter((d) => !d.isSettled);
  const settledDays = days.filter((d) => d.isSettled);
  const isAdjusted = preview && parseInt(adjustedAmount, 10) !== preview.computedAmount;

  // Today's date in business timezone (America/Bogota)
  const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(
    new Date(),
  );
  const todayUnsettledDay = unsettledDays.find((d) => d.date === todayStr);

  // Determine role-aware earnings descriptor
  const selectedEmployeeObj = employees.find((e) => e.id === selectedEmployee);
  const earningsDescriptorKey =
    selectedEmployeeObj?.role === "stylist"
      ? "earningsDescriptorStylist"
      : selectedEmployeeObj?.role === "clothier"
        ? "earningsDescriptorClothier"
        : "earningsDescriptorSecretary";

  function handlePayToday() {
    if (!todayUnsettledDay || !selectedEmployee) return;
    const newSelection = new Set<string>([todayUnsettledDay.id]);
    setSelectedDays(newSelection);
    setPreview(null);
    setSuccess(false);
    // Trigger preview immediately
    setError(null);
    startTransition(async () => {
      const res = await previewEarnings(selectedEmployee, [todayUnsettledDay.id]);
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setPreview(res.data);
      setAdjustedAmount(String(res.data.computedAmount));
    });
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Select employee */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("step1")}</h2>
        <select
          value={selectedEmployee}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedEmployee(id);
            setSelectedDays(new Set());
            setPreview(null);
            setSuccess(false);
            router.push(id ? `/admin/payroll?employeeId=${id}` : "/admin/payroll");
          }}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
          aria-label={t("selectEmployee")}
        >
          <option value="">{t("selectEmployee")}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({t(`role_${e.role}` as Parameters<typeof t>[0])})
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Select business days */}
      {selectedEmployee && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("step2")}</h2>
            <div className="flex items-center gap-2 mr-4">
              {selectedEmployeeObj && (
                <span className="text-xs text-muted-foreground">
                  {t(earningsDescriptorKey as Parameters<typeof t>[0])}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={(): void =>
                  setSelectedDays(
                    new Set(selectedDays.size === days.length ? [] : days.map((d) => d.id)),
                  )
                }
              >
                {selectedDays.size === days.length ? t("deselectAllDays") : t("selectAllDays")}
              </Button>
            </div>
          </div>
          {/* Pay today shortcut */}
          {todayUnsettledDay ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={handlePayToday}
              className="gap-1.5"
            >
              <ZapIcon className="size-3.5" aria-hidden="true" />
              {t("payTodayShortcut")}
            </Button>
          ) : (
            selectedEmployee && <p className="text-xs text-muted-foreground">{t("noTodayDay")}</p>
          )}
          {unsettledDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUnsettledDays")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unsettledDays.map((d) => (
                <Button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={`px-3 py-1 rounded-md border text-xs font-mono transition-colors ${
                    selectedDays.has(d.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input hover:bg-muted/50"
                  }`}
                >
                  {d.date}
                </Button>
              ))}
            </div>
          )}
          {settledDays.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("settledDaysNote", { count: settledDays.length })}
            </p>
          )}
          {selectedDays.size > 0 && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={handlePreview}>
              {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("preview")} ({selectedDays.size} {t("days")})
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Preview + confirm */}
      {preview && (
        <div className="border rounded-md p-4 space-y-4 bg-muted/10">
          <h2 className="text-sm font-semibold">{t("step3")}</h2>

          {/* Breakdown */}
          {preview.breakdown.type === "stylist" && (
            <div className="space-y-1 text-sm">
              {preview.breakdown.lines.map((line, i) =>
                line.excluded ? (
                  <div key={i} className="text-muted-foreground italic text-xs">
                    Ticket {line.ticketId.slice(0, 8)} — {t("needsReviewExcluded")}
                  </div>
                ) : (
                  <div key={i} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {line.serviceName ?? "Servicio"} ×{line.quantity}
                    </span>
                    <span className="font-mono tabular-nums">
                      ${line.earnings.toLocaleString("es-CO")}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          {preview.breakdown.type === "clothier" && (
            <div className="space-y-1 text-sm">
              {preview.breakdown.lines.map((line, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    {line.pieceName} ×{line.quantity}
                  </span>
                  <span className="font-mono tabular-nums">
                    ${line.earnings.toLocaleString("es-CO")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {preview.breakdown.type === "secretary" && (
            <div className="text-sm space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("daysWorked")}</span>
                <span>
                  {preview.breakdown.daysWorked} / {preview.breakdown.expectedWorkDays}{" "}
                  {t("perWeek")}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("dailyRate")}</span>
                <span className="font-mono">
                  ${preview.breakdown.dailyRate.toLocaleString("es-CO")}
                </span>
              </div>
            </div>
          )}

          <div className="border-t pt-3 flex items-center justify-between">
            <span className="text-sm font-medium">{t("computed")}</span>
            <span className="font-mono tabular-nums font-semibold">
              ${preview.computedAmount.toLocaleString("es-CO")}
            </span>
          </div>

          {/* Adjust amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="adjustedAmount">
                {t("finalAmount")} <span className="text-destructive">*</span>
              </label>
              <input
                id="adjustedAmount"
                type="number"
                min={0}
                value={adjustedAmount}
                onChange={(e) => setAdjustedAmount(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="method">
                {t("method")}
              </label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "card" | "transfer")}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="cash">{t("cash")}</option>
                <option value="card">{t("card")}</option>
                <option value="transfer">{t("transfer")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="notes">
                {t("notes")}
                <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
              </label>
              <input
                id="notes"
                type="text"
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          {isAdjusted && (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="adjustmentReason">
                {t("adjustmentReason")} <span className="text-destructive">*</span>
              </label>
              <input
                id="adjustmentReason"
                type="text"
                maxLength={500}
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder={t("adjustmentReasonPlaceholder")}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button size="sm" disabled={isPending} onClick={handleRecord}>
            {isPending ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5 mr-1" />
            )}
            {t("confirm")}
          </Button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 px-4 py-3">
          <CheckIcon className="h-4 w-4" />
          {t("payoutRecorded")}
        </div>
      )}

      {/* Payout history */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{t("historyTitle")}</h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("colEmployee")}</th>
                  <th className="px-3 py-2 text-right font-medium font-mono">{t("colAmount")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("colMethod")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("colDate")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("colDays")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{p.employeeName}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      ${p.amount.toLocaleString("es-CO")}
                      {p.adjustmentReason && (
                        <span className="ml-1 text-xs text-amber-600" title={p.adjustmentReason}>
                          *
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {t(`${p.method}` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {new Date(p.paidAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {p.periodDayCount}
                    </td>
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
