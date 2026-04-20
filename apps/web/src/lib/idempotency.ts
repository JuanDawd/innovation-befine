/**
 * T078 — Server-side idempotency helper
 *
 * Usage in a server action:
 *   const cached = await checkIdempotency(key, "markPieceDone");
 *   if (cached) return cached as ActionResult<void>;
 *   const result = await doWork();
 *   await storeIdempotency(key, "markPieceDone", result);
 *   return result;
 *
 * Keys expire after 24 hours. Expired keys are lazily deleted on lookup.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { idempotencyKeys } from "@befine/db/schema";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function checkIdempotency(key: string): Promise<unknown | null> {
  if (!key) return null;
  const db = getDb();
  const [existing] = await db
    .select({ responseBody: idempotencyKeys.responseBody, expiresAt: idempotencyKeys.expiresAt })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  if (!existing) return null;

  // Lazy expiry: delete and treat as miss
  if (new Date(existing.expiresAt) < new Date()) {
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    return null;
  }

  return existing.responseBody;
}

export async function storeIdempotency(
  key: string,
  route: string,
  response: unknown,
): Promise<void> {
  if (!key) return;
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db
    .insert(idempotencyKeys)
    .values({ key, route, responseBody: response as Record<string, unknown>, expiresAt })
    .onConflictDoNothing();
}
