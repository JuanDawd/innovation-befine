/**
 * Protected layout — T090, T048
 *
 * Server component: reads the Better Auth session and renders the AppShell.
 * Also fetches the employee ID and initial notifications for the bell icon.
 * Middleware already redirects unauthenticated requests to /login before this runs,
 * so session is always present here.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employees } from "@befine/db/schema";
import { AppShell } from "@/components/app-shell";
import { SyncStatus } from "@/components/sync-status";
import { listNotifications } from "@/app/(protected)/notifications/actions";
import type { AppRole } from "@befine/types";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const role = (session.user.role ?? "stylist") as AppRole;
  const userName = session.user.name;

  // Resolve employee ID for the notification bell
  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  const employeeId = emp?.id ?? null;

  // Fetch initial notifications (best-effort — empty list on failure)
  const notifResult = employeeId ? await listNotifications() : null;
  const initialNotifications = notifResult?.success ? notifResult.data : [];

  return (
    <AppShell
      role={role}
      userName={userName}
      employeeId={employeeId}
      initialNotifications={initialNotifications}
    >
      {children}
      <SyncStatus role={role} />
    </AppShell>
  );
}
