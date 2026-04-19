/**
 * Rate limiting — T04R-R5
 *
 * Wraps @upstash/ratelimit with an ephemeral in-memory store.
 * Production upgrade path: swap the `redis` parameter for an
 * @upstash/redis Redis.fromEnv() instance — no call-site changes needed.
 *
 * Caps from CLAUDE.md:
 *   Ticket creation:   30 / min / user
 *   Payout recording:  5  / min / admin  (Phase 7)
 *   Catalog edits:     20 / min / admin  (enforced in Phase 2 actions)
 *   General mutations: 60 / min / user
 */

import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

// In-process ephemeral store — compatible with @upstash/redis interface
const store = new Map<string, number[]>();

function makeInMemoryRedis(): Redis {
  const evalImpl = async <TResult>(
    _script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult> => {
    const key = keys[0] ?? String(args[0]);
    const now = Date.now();
    const windowMs = Number(args[1]) * 1000;
    const limit = Number(args[2]);

    const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
    const count = timestamps.length + 1;
    timestamps.push(now);
    store.set(key, timestamps);

    const reset = Math.ceil((timestamps[0]! + windowMs) / 1000);
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit ? 1 : 0;

    return [allowed, String(reset), count, remaining] as TResult;
  };
  return {
    eval: evalImpl,
    // REQUIRED: upstash uses this
    evalsha: async <TResult>(
      _sha: string,
      keys: string[],
      args: (string | number)[],
    ): Promise<TResult> => {
      return evalImpl<TResult>("", keys, args);
    },
  } as unknown as Redis;
}

function makeLimit(tokens: number, windowSeconds: number): Ratelimit {
  return new Ratelimit({
    redis: makeInMemoryRedis(),
    limiter: Ratelimit.slidingWindow(tokens, `${windowSeconds} s`),
    analytics: false,
  });
}

export const rateLimits = {
  /** 30 requests / 60s — ticket creation */
  ticketCreate: makeLimit(30, 60),
  /** 60 requests / 60s — general mutations (checkout, override, edit-requests, batches, pieces) */
  general: makeLimit(60, 60),
};

/**
 * Check rate limit for a given identifier (session.user.id).
 * Returns `{ allowed: true }` or `{ allowed: false }`.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ allowed: boolean }> {
  const { success } = await limiter.limit(identifier);
  return { allowed: success };
}
