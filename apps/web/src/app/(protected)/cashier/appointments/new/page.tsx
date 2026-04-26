/**
 * Cashier — book appointment page (T050)
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { BookAppointmentForm } from "@/components/book-appointment-form";

export default async function CashierNewAppointmentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  const t = await getTranslations("appointments");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">{t("bookAppointment")}</h1>
        <p className="text-sm text-muted-foreground">{t("bookAppointmentDescription")}</p>
      </div>
      <BookAppointmentForm redirectPath="/cashier" />
    </div>
  );
}
