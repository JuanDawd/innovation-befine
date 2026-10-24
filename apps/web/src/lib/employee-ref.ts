/**
 * M-62 — the signed-in user's employee id, without a DB round trip per action.
 *
 * Nearly every server action resolved `employees.id` from `session.user.id`
 * with its own query, sequentially before the real work. The mapping never
 * changes once an employee exists (employees are soft-deleted, never re-keyed),
 * so positive results are cached per process; `cache()` also dedupes within a
 * request. Misses are not cached, so a newly created employee resolves at once.
 * Callers still authorize by role from the session — this is only the lookup.
 */

import { cache } from "react";
import { eq } from "drizzle-orm";
import { employees } from "@befine/db/schema";
import { getDb } from "@/lib/db";

const MAX_ENTRIES = 500;
const byUserId = new Map<string, string>();

export const getEmployeeRef = cache(async (userId: string): Promise<{ id: string } | undefined> => {
  const hit = byUserId.get(userId);
  if (hit) return { id: hit };

  const [emp] = await getDb()
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  if (!emp) return undefined;

  if (byUserId.size >= MAX_ENTRIES) byUserId.clear();
  byUserId.set(userId, emp.id);
  return { id: emp.id };
});

/** Test helper: forget cached ids. */
export function clearEmployeeRefCache(): void {
  byUserId.clear();
}
