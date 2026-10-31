/**
 * M-83 — one dropped connection must not fail a whole server render.
 *
 * Wraps the fetch used by the Neon HTTP driver. Read-only statements are retried
 * when the request itself fails (fetch failed, ECONNRESET). SQL errors arrive as
 * HTTP responses, so they are never retried. Writes are never retried either: the
 * connection may have dropped after the commit.
 */

const RETRY_DELAYS_MS = [100, 300];
const WRITE_KEYWORD = /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke)\b/i;

function isReadOnlyStatement(query: unknown): boolean {
  if (typeof query !== "string") return false;
  const q = query.trimStart();
  if (/^select\b/i.test(q)) return !/\bfor\s+(update|share|no\s+key|key)\b/i.test(q);
  return /^with\b/i.test(q) && !WRITE_KEYWORD.test(q);
}

/** Pure: is this driver request body safe to send twice? */
export function isRetryableBody(body: unknown): boolean {
  if (typeof body !== "string") return false;
  try {
    const parsed = JSON.parse(body) as { query?: unknown; queries?: { query?: unknown }[] };
    if (Array.isArray(parsed.queries))
      return parsed.queries.length > 0 && parsed.queries.every((q) => isReadOnlyStatement(q.query));
    return isReadOnlyStatement(parsed.query);
  } catch {
    return false;
  }
}

function isAbort(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export const retryingFetch: typeof fetch = async (input, init) => {
  const retryable = isRetryableBody(init?.body);
  for (let attempt = 0; ; attempt++) {
    try {
      return await globalThis.fetch(input, init);
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!retryable || delay === undefined || isAbort(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
