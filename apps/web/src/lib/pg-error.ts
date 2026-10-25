/**
 * The Postgres error code (SQLSTATE) of a failed query, raw or wrapped.
 * Drizzle ≥ 0.44 wraps driver errors in DrizzleQueryError ("Failed query: …")
 * with the database error on `cause`, so `err.code` alone misses it.
 */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  if (typeof e?.code === "string") return e.code;
  if (typeof e?.cause?.code === "string") return e.cause.code;
  return undefined;
}

/** 23505 — unique_violation */
export const isUniqueViolation = (err: unknown) => pgErrorCode(err) === "23505";
