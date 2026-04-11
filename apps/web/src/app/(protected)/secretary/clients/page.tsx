/**
 * Secretary — clients page — T030
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { ClientList } from "@/components/client-list";
import { listClients } from "@/app/(protected)/clients/actions";

async function ClientData() {
  const result = await listClients(true);
  const clients = result.success ? result.data : [];
  return <ClientList initialClients={clients} />;
}

export default async function SecretaryClientsPage() {
  const t = await getTranslations("clients");

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
      <Suspense fallback={<PageSkeleton />}>
        <ClientData />
      </Suspense>
    </div>
  );
}
