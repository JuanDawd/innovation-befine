/**
 * JSON wire format for /api/q reads. Server actions keep `Date` values through
 * RSC serialization; plain JSON would turn them into strings and break callers
 * that call Date methods. Dates are tagged on the way out and revived on the
 * way in.
 */
const DATE_TAG = "$date";

export function encodeWire(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const raw = this[key];
    return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : v;
  });
}

export function decodeWire<T>(text: string): T {
  return JSON.parse(text, (_key, v) =>
    v && typeof v === "object" && typeof v[DATE_TAG] === "string" && Object.keys(v).length === 1
      ? new Date(v[DATE_TAG])
      : v,
  ) as T;
}
