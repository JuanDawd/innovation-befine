/**
 * Business settings utility — T108
 *
 * Returns the single business_settings row, cached per request via React's `cache()`.
 * Use this in server components and server actions — never call the DB directly.
 */

import { cache } from "react";
import { businessSettings, BUSINESS_SETTINGS_ID } from "@befine/db/schema";
import { getDb } from "./db";

export type BusinessSettings = typeof businessSettings.$inferSelect;

export const getBusinessSettings = cache(async (): Promise<BusinessSettings> => {
  const db = getDb();
  const rows = await db.query.businessSettings.findMany({
    where: (t, { eq }) => eq(t.id, BUSINESS_SETTINGS_ID),
    limit: 1,
  });

  if (rows.length === 0) {
    throw new Error("business_settings row is missing — run migrations");
  }

  return rows[0]!;
});
