/**
 * Cashier checkout page — T038, T039
 */

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { CheckoutForm } from "@/components/checkout-form";
import { PageHeader } from "@/components/page-header";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier", "admin")) redirect("/cashier");
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-xl mx-auto w-full">
      <PageHeader
        title={t("tickets.checkoutTitle")}
        description={t("tickets.checkoutSubtitle")}
        backHref="/cashier"
        backLabel={t("common.back")}
      />
      <CheckoutForm preselectTicketId={ticket} />
    </div>
  );
}
