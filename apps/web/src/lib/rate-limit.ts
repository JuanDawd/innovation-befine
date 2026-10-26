/**
 * Rate limiting — T04R-R5, M-59
 *
 * @upstash/ratelimit backed by Upstash Redis when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set — the caps then hold across every Vercel
 * instance. Without them (local dev, tests, self-hosted single process) an
 * in-memory sliding window is used: per process, expired keys are evicted.
 * Each limiter has its own key prefix so buckets never mix.
 *
 * Caps from CLAUDE.md:
 *   Ticket creation:   30 / min / user
 *   Payout recording:  5  / min / admin  (Phase 7)
 *   Catalog edits:     20 / min / admin  (enforced in Phase 2 actions)
 *   General mutations: 60 / min / user
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

// ─── In-memory fallback ───────────────────────────────────────────────────────
//
// Mirrors @upstash/ratelimit's single-region sliding-window Lua script:
// KEYS = [currentKey, previousKey], ARGV = [tokens, now, windowMs, incrementBy],
// returns [remainingTokens (-1 when blocked), limit]. Keys embed the window
// number, so each one expires like the PEXPIRE in the script and is swept.

type Counter = { value: number; expiresAt: number };
const store = new Map<string, Counter>();
const SWEEP_EVERY = 500;
let callsSinceSweep = 0;

/** Drop counters past their expiry. */
export function sweepExpired(now = Date.now()): void {
  for (const [key, counter] of store) if (counter.expiresAt <= now) store.delete(key);
}

/** Number of keys held by the in-memory store (for tests). */
export function inMemoryKeyCount(): number {
  return store.size;
}

function read(key: string | undefined, now: number): number {
  if (!key) return 0;
  const counter = store.get(key);
  return counter && counter.expiresAt > now ? counter.value : 0;
}

function makeInMemoryRedis(): Redis {
  const evalImpl = async <TResult>(
    _script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult> => {
    const [currentKey, previousKey] = keys;
    const tokens = Number(args[0]);
    const now = Number(args[1]);
    const windowMs = Number(args[2]);
    const incrementBy = Number(args[3] ?? 1);

    if (++callsSinceSweep >= SWEEP_EVERY) {
      callsSinceSweep = 0;
      sweepExpired(now);
    }

    const current = read(currentKey, now);
    const percentageInCurrent = (now % windowMs) / windowMs;
    const previous = Math.floor((1 - percentageInCurrent) * read(previousKey, now));

    if (incrementBy > 0 && previous + current >= tokens) return [-1, tokens] as TResult;

    const value = current + incrementBy;
    const existing = store.get(currentKey!);
    store.set(currentKey!, {
      value,
      expiresAt:
        existing && existing.expiresAt > now ? existing.expiresAt : now + windowMs * 2 + 1000,
    });
    return [tokens - (value + previous), tokens] as TResult;
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

// ─── Limiters ─────────────────────────────────────────────────────────────────

const sharedRedis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

/** True when limits are enforced across instances (Upstash configured). */
export const rateLimitIsShared = sharedRedis !== null;

function makeLimit(name: string, tokens: number, windowSeconds: number): Ratelimit {
  return new Ratelimit({
    redis: sharedRedis ?? makeInMemoryRedis(),
    limiter: Ratelimit.slidingWindow(tokens, `${windowSeconds} s`),
    prefix: `befine:rl:${name}`,
    analytics: false,
  });
}

export const rateLimits = {
  /** 30 requests / 60s — ticket creation */
  ticketCreate: makeLimit("ticketCreate", 30, 60),
  /** 5 requests / 60s — payout recording (admin financial mutation) */
  payoutRecording: makeLimit("payoutRecording", 5, 60),
  /** 60 requests / 60s — general mutations (checkout, override, edit-requests, products, pieces) */
  general: makeLimit("general", 60, 60),
  /** 20 requests / 60s — catalog edits (sizes and colours, T110) */
  catalogEdit: makeLimit("catalogEdit", 20, 60),
  /** 20 requests / 60s — analytics CSV export (heavier, must not be easily enumerated) */
  analyticsCsv: makeLimit("analyticsCsv", 20, 60),
  /** 60 requests / 60s — public /api/health endpoint, IP-keyed (T10R-R10) */
  publicHealth: makeLimit("publicHealth", 60, 60),
  /** 30 requests / 60s — public /api/version endpoint, IP-keyed (T10R-R10) */
  publicVersion: makeLimit("publicVersion", 30, 60),
};

/**
 * Check rate limit for a given identifier (session.user.id).
 * Returns `{ allowed: true }` or `{ allowed: false }`.
 * Fails open: if Redis is unreachable the mutation proceeds (a limiter outage
 * must not block checkout), and the failure is logged.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ allowed: boolean }> {
  try {
    const { success } = await limiter.limit(identifier);
    return { allowed: success };
  } catch (err) {
    logger.warn({ err }, "Rate limiter unavailable — allowing request");
    return { allowed: true };
  }
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
  let result: { success: boolean; reset: number };
  try {
    result = await limiter.limit(`${bucket}:${ip}`);
  } catch (err) {
    logger.warn({ err, bucket }, "Rate limiter unavailable — allowing request");
    return null;
  }
  const { success, reset } = result;
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
