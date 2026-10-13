/**
 * Secretary — clients page — T030
 */

import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { ClientList } from "@/components/client-list";
import { listClients } from "@/app/(protected)/clients/actions";
import { PageHeader } from "@/components/page-header";

async function ClientData() {
  const result = await listClients(true);
  const clients = result.success ? result.data : [];
  return <ClientList initialClients={clients} />;
}

export default async function SecretaryClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  const t = await getTranslations("clients");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("pageTitle")} />
      <Suspense fallback={<PageSkeleton />}>
        <ClientData />
      </Suspense>
    </div>
  );
}
