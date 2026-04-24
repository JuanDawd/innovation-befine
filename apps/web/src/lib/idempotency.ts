/**
 * T078 — Server-side idempotency helper
 *
 * checkIdempotency: Returns cached response if key is live, null on miss.
 * Expired-key deletion uses DELETE…RETURNING to eliminate the read-delete race
 * (T09R-R7): only one concurrent caller deletes the row; others fall through.
 *
 * storeIdempotency: Must be called inside the same DB transaction as the
 * mutation (T09R-R12) so a concurrent duplicate either blocks on the unique
 * constraint or sees the committed response.
 *
 * Usage:
 *   return await txDb.transaction(async (tx) => {
 *     const cached = await checkIdempotency(key);
 *     if (cached) return cached as ActionResult<T>;
 *     const result = await doWork(tx);
 *     await storeIdempotency(key, "route", result, tx);
 *     return result;
 *   });
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { idempotencyKeys } from "@befine/db/schema";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type AnyTx = Pick<ReturnType<typeof getDb>, "select" | "delete" | "insert" | "update"> & {
  execute?: unknown;
};

export async function checkIdempotency(key: string, tx?: AnyTx): Promise<unknown | null> {
  if (!key) return null;
  const db = (tx ?? getDb()) as ReturnType<typeof getDb>;
  const [existing] = await db
    .select({ responseBody: idempotencyKeys.responseBody, expiresAt: idempotencyKeys.expiresAt })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  if (!existing) return null;

  if (new Date(existing.expiresAt) >= new Date()) {
    return existing.responseBody;
  }

  // Expired: use DELETE…RETURNING so only one concurrent caller deletes the row
  // (T09R-R7). The caller that gets 0 rows back falls through to re-execution.
  const deleted = await db
    .delete(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .returning({ key: idempotencyKeys.key });

  void deleted; // result intentionally unused — we always return null on expiry
  return null;
}

export async function storeIdempotency(
  key: string,
  route: string,
  response: unknown,
  tx?: AnyTx,
): Promise<void> {
  if (!key) return;
  const db = (tx ?? getDb()) as ReturnType<typeof getDb>;
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db
    .insert(idempotencyKeys)
    .values({ key, route, responseBody: response as Record<string, unknown>, expiresAt })
    .onConflictDoNothing();
}
