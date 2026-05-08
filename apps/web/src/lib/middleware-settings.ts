/**
 * Business settings cache for middleware.
 *
 * React's `cache()` is request-scoped and unavailable in middleware.
 * This module uses a module-level in-memory cache with a 60-second TTL
 * so middleware can read `cashier_can_access_admin` without a DB hit on
 * every request. A stale read during the TTL window is acceptable —
 * the toggle is a configuration change, not a real-time gate.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessSettings, BUSINESS_SETTINGS_ID } from "@befine/db/schema";

const TTL_MS = 60_000;

let cachedValue: boolean = false;
let cacheExpiresAt: number = 0;

export async function getCashierCanAccessAdminCached(): Promise<boolean> {
  const now = Date.now();
  if (now < cacheExpiresAt) return cachedValue;

  try {
    const db = getDb();
    const [row] = await db
      .select({ cashierCanAccessAdmin: businessSettings.cashierCanAccessAdmin })
      .from(businessSettings)
      .where(eq(businessSettings.id, BUSINESS_SETTINGS_ID))
      .limit(1);

    cachedValue = row?.cashierCanAccessAdmin ?? false;
    cacheExpiresAt = now + TTL_MS;
  } catch {
    // On any DB error, fall back to the previously cached value (default: false).
    // This ensures a transient DB outage never grants unexpected access.
  }

  return cachedValue;
}
