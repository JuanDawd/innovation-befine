import type { ActionResult } from "@/lib/action-result";
import type { QueryName, QueryRegistry } from "@/lib/query-registry";
import { decodeWire } from "@/lib/query-wire";

export class QueryActionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "QueryActionError";
  }
}

/**
 * Adapts a server action returning `ActionResult<T>` into a TanStack Query
 * `queryFn`: resolves with `data`, throws `QueryActionError` on failure so the
 * query enters its `error` state.
 */
export async function unwrap<T>(promise: Promise<ActionResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.success) throw new QueryActionError(result.error.code, result.error.message);
  return result.data;
}

type QueryData<K extends QueryName> =
  Awaited<ReturnType<QueryRegistry[K]>> extends ActionResult<infer T> ? T : never;

/**
 * TanStack Query `queryFn` for reads: GET /api/q/:name instead of calling the
 * server action directly, so reads run in parallel instead of queuing behind
 * other actions (M-64). Same `ActionResult` contract and errors as `unwrap`.
 */
export async function fetchQuery<K extends QueryName>(
  name: K,
  params?: Record<string, string | undefined>,
): Promise<QueryData<K>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const res = await fetch(`/api/q/${name}${qs.size ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  // A lost session makes middleware redirect to /login (HTML), not JSON.
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new QueryActionError("UNAUTHORIZED", "No autenticado");
  }
  return unwrap(Promise.resolve(decodeWire<ActionResult<QueryData<K>>>(await res.text())));
}
