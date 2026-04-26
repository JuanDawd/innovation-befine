import { getTranslations } from "next-intl/server";
import { listClosedBusinessDays, getUnsettledEmployees, listPayouts } from "./actions";
import { PayrollScreen } from "./payroll-screen";
import { UnsettledAlert } from "./unsettled-alert";
import { listActiveEmployeesForAbsence } from "../absences/actions";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  const t = await getTranslations("payroll");
  const sp = await searchParams;
  const employeeId = sp.employeeId;

  const [daysResult, employeesResult, unsettledResult, historyResult] = await Promise.all([
    listClosedBusinessDays(employeeId),
    listActiveEmployeesForAbsence(),
    getUnsettledEmployees(),
    listPayouts(employeeId),
  ]);

  const days = daysResult.success ? daysResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];
  const unsettled = unsettledResult.success ? unsettledResult.data : [];
  const history = historyResult.success ? historyResult.data : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
      <UnsettledAlert unsettled={unsettled} />
      <PayrollScreen
        key={employeeId ?? "none"}
        days={days}
        employees={employees}
        history={history}
        initialEmployeeId={employeeId}
      />
    </div>
  );
}
