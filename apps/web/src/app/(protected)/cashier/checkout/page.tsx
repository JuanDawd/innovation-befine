/**
 * Cashier checkout page — T038, T039
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { CheckoutForm } from "@/components/checkout-form";

export default async function CheckoutPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-xl mx-auto w-full">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Cobrar</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona los tickets a cobrar e indica el método de pago.
        </p>
      </div>
      <CheckoutForm />
    </div>
  );
}
