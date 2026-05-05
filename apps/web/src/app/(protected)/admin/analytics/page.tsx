import { getAnalyticsSummary } from "./actions";
import { AnalyticsDashboard } from "./analytics-dashboard";

export default async function AnalyticsPage() {
  const result = await getAnalyticsSummary({ period: "day", includeInactive: false });
  const emptyMetrics = {
    revenue: 0,
    serviceRevenue: 0,
    craftableSalesRevenue: 0,
    jobs: 0,
    earnings: 0,
    earningsBySource: { service: 0, pieceCreated: 0, workedDay: 0 },
  };
  const initialData = result.success
    ? result.data
    : {
        period: "day" as const,
        current: emptyMetrics,
        prior: emptyMetrics,
        dailyBreakdown: [],
        earningsTable: [],
      };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 flex flex-col gap-6">
      <AnalyticsDashboard initialData={initialData} />
    </div>
  );
}
