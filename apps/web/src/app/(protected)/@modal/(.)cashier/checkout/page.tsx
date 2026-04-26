import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { ModalShell } from "@/components/modal-shell";
import { CheckoutForm } from "@/components/checkout-form";

export default async function CheckoutModal() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/cashier");

  return (
    <ModalShell title="Cobrar" maxWidth="xl">
      <CheckoutForm />
    </ModalShell>
  );
}
