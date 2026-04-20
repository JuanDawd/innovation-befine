import { getTranslations } from "next-intl/server";
import { listClosedBusinessDays, getUnsettledEmployees, listPayouts } from "./actions";
import { PayrollScreen } from "./payroll-screen";
import { UnsettledAlert } from "./unsettled-alert";
import { listActiveEmployeesForAbsence } from "../absences/actions";

export default async function PayrollPage() {
  const t = await getTranslations("payroll");

  const [daysResult, employeesResult, unsettledResult, historyResult] = await Promise.all([
    listClosedBusinessDays(),
    listActiveEmployeesForAbsence(),
    getUnsettledEmployees(),
    listPayouts(),
  ]);

  const days = daysResult.success ? daysResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];
  const unsettled = unsettledResult.success ? unsettledResult.data : [];
  const history = historyResult.success ? historyResult.data : [];

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">{t("pageTitle")}</h1>
      <UnsettledAlert unsettled={unsettled} />
      <PayrollScreen days={days} employees={employees} history={history} />
    </div>
  );
}
