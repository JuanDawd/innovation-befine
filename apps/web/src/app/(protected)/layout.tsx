/**
 * Protected layout — T090
 *
 * Server component: reads the Better Auth session and renders the AppShell.
 * Middleware already redirects unauthenticated requests to /login before this runs,
 * so session is always present here.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import type { AppRole } from "@befine/types";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const role = (session.user.role ?? "stylist") as AppRole;
  const userName = session.user.name;

  return (
    <AppShell role={role} userName={userName}>
      {children}
    </AppShell>
  );
}
