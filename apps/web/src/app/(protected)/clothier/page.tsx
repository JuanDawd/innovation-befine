/**
 * Clothier home: Mi trabajo — T123 (spec §3.10)
 *
 * Phone-first: corrections, her work by delivery date, and Disponibles.
 * The previous products board lives at /clothier/productos until T135.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { MiTrabajo } from "@/components/mi-trabajo";
import { PageHeader } from "@/components/page-header";

export default async function ClothierHomePage() {
  const t = await getTranslations("miTrabajo");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "clothier")) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title={t("pageTitle")} className="px-4 pt-6 pb-2" />
      <MiTrabajo />
      <p className="px-4 pb-8 text-center text-sm">
        <Link
          href="/clothier/productos"
          className="text-muted-foreground underline underline-offset-4"
        >
          {t("oldBoard")}
        </Link>
      </p>
    </div>
  );
}
