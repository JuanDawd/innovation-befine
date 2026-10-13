import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsForm } from "./settings-form";
import { getBusinessSettings } from "./actions";
import { PageHeader } from "@/components/page-header";

export default async function AdminSettingsPage() {
  const [res, t] = await Promise.all([getBusinessSettings(), getTranslations("settings")]);

  if (!res.success) {
    if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") {
      redirect("/403");
    }
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{res.error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} />
      <SettingsForm initialSettings={res.data} />
    </div>
  );
}
