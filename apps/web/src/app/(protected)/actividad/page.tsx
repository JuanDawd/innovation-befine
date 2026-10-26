/**
 * Actividad — T132. Admin only (middleware + actions).
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getActivityPeople } from "./actions";
import { ActivityScreen } from "./activity-screen";

export default async function ActividadPage() {
  const t = await getTranslations("activity");
  const people = await getActivityPeople();
  if (!people.success) redirect(people.error.code === "UNAUTHORIZED" ? "/login" : "/403");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
      <ActivityScreen people={people.data} />
    </div>
  );
}
