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
  /** 5 requests / 60s — payout recording (admin financial mutation) */
  payoutRecording: makeLimit(5, 60),
  /** 60 requests / 60s — general mutations (checkout, override, edit-requests, batches, pieces) */
  general: makeLimit(60, 60),
  /** 20 requests / 60s — analytics CSV export (heavier, must not be easily enumerated) */
  analyticsCsv: makeLimit(20, 60),
  /** 60 requests / 60s — public /api/health endpoint, IP-keyed (T10R-R10) */
  publicHealth: makeLimit(60, 60),
  /** 30 requests / 60s — public /api/version endpoint, IP-keyed (T10R-R10) */
  publicVersion: makeLimit(30, 60),
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

/**
 * Extract a client IP from a Next.js Request. Vercel sets `x-forwarded-for`
 * with a comma-separated chain; the leftmost entry is the originating client.
 * Falls back to `x-real-ip`, then a literal "unknown" so a missing header does
 * not collapse all callers into a single bucket on a non-Vercel host.
 */
export function clientIpFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * IP-keyed rate-limit check for unauthenticated public endpoints. On exceedance
 * returns a 429 NextResponse with `Retry-After`; on success returns null so the
 * caller continues. Identifier is namespaced per limiter so different endpoints
 * do not share buckets.
 */
export async function checkPublicRateLimit(
  limiter: Ratelimit,
  req: Request,
  bucket: string,
): Promise<Response | null> {
  const ip = clientIpFromRequest(req);
  const { success, reset } = await limiter.limit(`${bucket}:${ip}`);
  if (success) return null;
  const retryAfter = Math.max(1, Math.ceil(reset - Date.now() / 1000));
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
    },
  });
}
