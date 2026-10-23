import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { BookAppointmentForm } from "@/components/book-appointment-form";

/** Shared by the `new` modal (intercepted) and the full `/new` page (direct load / refresh). */
export async function NewAppointmentContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "secretary")) redirect("/secretary");

  return <BookAppointmentForm redirectPath="/secretary/appointments" />;
}
