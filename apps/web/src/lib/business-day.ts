/**
 * Business day utility — T019
 *
 * Returns the currently open business day, or null if none is open.
 * Cached per request via React's `cache()` — call freely in server components and actions.
 */

import { cache } from "react";
import { desc, isNotNull, isNull } from "drizzle-orm";
import { businessDays } from "@befine/db/schema";
import { getDb } from "./db";

export type BusinessDay = typeof businessDays.$inferSelect;

/**
 * Returns the currently open business day (closed_at IS NULL), or null.
 */
export const getCurrentBusinessDay = cache(async (): Promise<BusinessDay | null> => {
  const db = getDb();
  const rows = await db.select().from(businessDays).where(isNull(businessDays.closedAt)).limit(1);

  return rows[0] ?? null;
});

/**
 * Returns the most recently closed business day, or null if none exists.
 * Used to determine if reopening is possible.
 */
export const getLastClosedBusinessDay = cache(async (): Promise<BusinessDay | null> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(businessDays)
    .where(isNotNull(businessDays.closedAt))
    .orderBy(desc(businessDays.closedAt))
    .limit(1);

  return rows[0] ?? null;
});
