import { getTranslations } from "next-intl/server";
import { listAbsencesForMonth, listActiveEmployeesForAbsence } from "./actions";
import { AbsenceCalendar } from "./absence-calendar";

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const t = await getTranslations("absences");
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const month = sp.month ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const [absencesResult, employeesResult] = await Promise.all([
    listAbsencesForMonth(year, month),
    listActiveEmployeesForAbsence(),
  ]);

  const absences = absencesResult.success ? absencesResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
      <AbsenceCalendar year={year} month={month} absences={absences} employees={employees} />
    </div>
  );
}
