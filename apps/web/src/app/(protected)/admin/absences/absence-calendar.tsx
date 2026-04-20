"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logAbsence, deleteAbsence, type AbsenceRow, type EmployeeOption } from "./actions";

type Props = {
  year: number;
  month: number;
  absences: AbsenceRow[];
  employees: EmployeeOption[];
};

const ABSENCE_COLORS = {
  vacation: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  approved_absence: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  missed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
} as const;

// Generate day headers from Intl (locale-aware, Mon-Sun order for the grid)
function getDayHeaders(locale: string): string[] {
  // We want Sun-first order to match getDay() (0=Sun)
  // Jan 7 2024 = Sun (0), Jan 8 = Mon (1), … Jan 13 = Sat (6)
  return Array.from({ length: 7 }, (_, i) => {
    const ref = new Date(Date.UTC(2024, 0, 7 + i)); // 7=Sun, 8=Mon...
    return ref.toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });
  });
}

export function AbsenceCalendar({ year, month, absences, employees }: Props) {
  const t = useTranslations("absences");
  const locale = useLocale();
  const router = useRouter();
  const DAYS_OF_WEEK = getDayHeaders(locale);
  const [isPending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const absenceMap = new Map<string, AbsenceRow[]>();
  for (const a of absences) {
    const key = a.date;
    if (!absenceMap.has(key)) absenceMap.set(key, []);
    absenceMap.get(key)!.push(a);
  }

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    router.push(`/admin/absences?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  }

  function nextMonth() {
    const d = new Date(year, month, 1);
    router.push(`/admin/absences?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  }

  function handleLogAbsence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await logAbsence({
        employeeId: fd.get("employeeId") as string,
        type: fd.get("type") as string,
        date: selectedDate!,
        note: (fd.get("note") as string) || null,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setSelectedDate(null);
      router.refresh();
    });
  }

  function handleDelete(absenceId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteAbsence({ absenceId });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={prevMonth} disabled={isPending}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
        <Button variant="outline" size="sm" onClick={nextMonth} disabled={isPending}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Desktop: calendar grid */}
      <div className="hidden md:block rounded-md border overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/50">
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-xs font-medium text-center text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-border">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="min-h-[80px] bg-muted/10" />;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayAbsences = absenceMap.get(dateStr) ?? [];
            const isSelected = selectedDate === dateStr;
            return (
              <button
                key={dateStr}
                type="button"
                className={`min-h-[80px] p-1 w-full text-left hover:bg-muted/20 transition-colors ${isSelected ? "ring-2 ring-inset ring-primary" : ""}`}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                aria-pressed={isSelected}
                aria-label={t("logAbsenceFor", { date: dateStr })}
              >
                <span className="text-xs font-medium text-muted-foreground">{day}</span>
                <div className="mt-0.5 space-y-0.5">
                  {dayAbsences.map((a) => (
                    <div
                      key={a.id}
                      className={`text-xs rounded px-1 py-0.5 flex items-center justify-between gap-1 ${ABSENCE_COLORS[a.type]}`}
                    >
                      <span className="truncate max-w-[80px]">{a.employeeName.split(" ")[0]}</span>
                      <button
                        type="button"
                        className="opacity-50 hover:opacity-100 shrink-0"
                        aria-label={t("deleteAbsence")}
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(a.id);
                        }}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: list view grouped by date */}
      <div className="md:hidden space-y-3">
        {absences.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">{t("noAbsences")}</p>
        )}
        {Array.from(absenceMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, rows]) => (
            <div key={date} className="border rounded-md p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {new Date(date + "T12:00:00").toLocaleDateString("es-CO", { dateStyle: "medium" })}
              </p>
              {rows.map((a) => (
                <div
                  key={a.id}
                  className={`text-xs rounded px-2 py-1 flex items-center justify-between ${ABSENCE_COLORS[a.type]}`}
                >
                  <span>
                    {a.employeeName} — {t(`type_${a.type}` as Parameters<typeof t>[0])}
                  </span>
                  <button
                    aria-label={t("deleteAbsence")}
                    disabled={isPending}
                    onClick={() => handleDelete(a.id)}
                    className="opacity-60 hover:opacity-100 ml-2"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        {/* Mobile add — date picker defaulting to today in Bogota */}
        <div className="flex gap-2">
          <input
            type="date"
            defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}
            aria-label={t("selectDate")}
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
            onChange={(e) => setSelectedDate(e.target.value || null)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>("input[type=date]");
              const date =
                input?.value ||
                new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
              setSelectedDate(selectedDate === date ? null : date);
            }}
          >
            <PlusIcon className="h-4 w-4 mr-1" aria-hidden="true" />
            {t("logAbsence")}
          </Button>
        </div>
      </div>

      {/* Add absence form (shown when a date is selected on desktop; always available on mobile) */}
      {selectedDate && (
        <div className="border rounded-md p-4 space-y-4 bg-muted/10">
          <p className="text-sm font-semibold">
            {t("logAbsenceFor", {
              date: new Date(selectedDate + "T12:00:00").toLocaleDateString("es-CO", {
                dateStyle: "medium",
              }),
            })}
          </p>
          <form onSubmit={handleLogAbsence} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="employeeId">
                  {t("employee")} <span className="text-destructive">*</span>
                </label>
                <select
                  id="employeeId"
                  name="employeeId"
                  required
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                >
                  <option value="">{t("selectEmployee")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="type">
                  {t("type")} <span className="text-destructive">*</span>
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                >
                  <option value="vacation">{t("type_vacation")}</option>
                  <option value="approved_absence">{t("type_approved_absence")}</option>
                  <option value="missed">{t("type_missed")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="note">
                  {t("note")}
                  <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                </label>
                <input
                  id="note"
                  name="note"
                  type="text"
                  maxLength={500}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:border-ring"
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                {t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedDate(null);
                  setError(null);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(["vacation", "approved_absence", "missed"] as const).map((type) => (
          <span key={type} className={`rounded px-2 py-0.5 ${ABSENCE_COLORS[type]}`}>
            {t(`type_${type}` as Parameters<typeof t>[0])}
          </span>
        ))}
      </div>
    </div>
  );
}
