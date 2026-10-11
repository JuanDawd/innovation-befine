import type { ActionResult } from "@/lib/action-result";

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
