/**
 * Clothier home — T046
 *
 * Shows today's assigned pieces and unassigned (claimable) pieces.
 * Mobile-first, checklist style with progress bar.
 */

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import { getDb } from "@/lib/db";
import { employees } from "@befine/db/schema";
import { ClothierWorkBoard } from "@/components/clothier-work-board";

export default async function ClothierHomePage() {
  const t = await getTranslations("clothierWork");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "clothier")) redirect("/login");

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  if (!emp) redirect("/login");

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-semibold">{t("pageTitle")}</h1>
      </div>
      <ClothierWorkBoard employeeId={emp.id} />
    </div>
  );
}
