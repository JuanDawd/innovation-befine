import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getAnalyticsSummary } from "./actions";
import { AnalyticsDashboard } from "./analytics-dashboard";

const PERIODS = ["day", "week", "month"] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; inactive?: string }>;
}) {
  const params = await searchParams;
  const period = PERIODS.find((p) => p === params.period) ?? "day";
  const includeInactive = params.inactive === "1";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "admin")) redirect("/admin");

  const result = await getAnalyticsSummary({ period, includeInactive });
  const emptyMetrics = {
    revenue: 0,
    serviceRevenue: 0,
    productSalesRevenue: 0,
    jobs: 0,
    earnings: 0,
    earningsBySource: { service: 0, pieceCreated: 0, workedDay: 0 },
  };
  const initialData = result.success
    ? result.data
    : {
        period,
        current: emptyMetrics,
        prior: emptyMetrics,
        dailyBreakdown: [],
        earningsTable: [],
        byMethod: { cash: 0, card: 0, transfer: 0, unrecorded: 0 },
      };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 flex flex-col gap-6">
      <AnalyticsDashboard initialData={initialData} />
    </div>
  );
}
