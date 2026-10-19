import { redirect } from "next/navigation";

/**
 * Tenant root: staff go straight to sign-in (signed-in users are sent on to
 * their role's home by the middleware). The public sales page lives in apps/site.
 */
export default function RootPage() {
  redirect("/login");
}
