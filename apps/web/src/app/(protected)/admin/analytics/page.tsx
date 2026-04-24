import { getTranslations } from "next-intl/server";
import { getAnalyticsSummary } from "./actions";
import { AnalyticsDashboard } from "./analytics-dashboard";

export default async function AnalyticsPage() {
  const t = await getTranslations("analytics");
  const result = await getAnalyticsSummary({ period: "day", includeInactive: false });
  const initialData = result.success
    ? result.data
    : {
        period: "day" as const,
        current: { revenue: 0, jobs: 0, earnings: 0 },
        prior: { revenue: 0, jobs: 0, earnings: 0 },
        dailyBreakdown: [],
        earningsTable: [],
      };

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold print:text-2xl">{t("pageTitle")}</h1>
      <AnalyticsDashboard initialData={initialData} />
    </div>
  );
}
