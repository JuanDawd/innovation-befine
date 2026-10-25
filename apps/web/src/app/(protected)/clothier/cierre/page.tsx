/**
 * Cerrar mi jornada — T125. Clothier only (middleware + actions).
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getMyClosing } from "../work-actions";
import { ClosingForm } from "./closing-form";

export default async function CierrePage() {
  const t = await getTranslations("cierre");
  const tc = await getTranslations("common");
  const res = await getMyClosing();
  if (!res.success) redirect(res.error.code === "UNAUTHORIZED" ? "/login" : "/403");
  return (
    <div className="flex min-h-screen flex-col gap-4 px-4 pt-6 pb-8">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageSubtitle")}
        backHref="/clothier"
        backLabel={tc("back")}
      />
      <ClosingForm data={res.data} />
    </div>
  );
}
