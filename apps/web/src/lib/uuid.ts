/**
 * RFC 4122 v4 UUID that also works outside secure contexts.
 *
 * `crypto.randomUUID()` is only defined on HTTPS/localhost; on a plain-HTTP
 * LAN deployment it is `undefined` and calling it throws inside the submit
 * handler, so the form silently does nothing (M-68). `getRandomValues` is
 * available everywhere.
 */
export function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
