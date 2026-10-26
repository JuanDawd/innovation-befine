/**
 * Activity log helpers for server code — T114
 *
 * logActivity itself lives in @befine/db and requires a transaction; these
 * helpers only build the actor and request details from the session.
 */

export { logActivity, type ActivityTx, type ActivityEntry } from "@befine/db";

/** Actor of an entry, taken from the Better Auth session user (never from client input). */
export function actorOf(user: { id: string; role?: string | null }) {
  return { userId: user.id, role: user.role ?? null };
}

/** IP and user agent of the request, for sign-in entries. */
export function deviceOf(headers: Headers | undefined | null) {
  const xff = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: xff || headers?.get("x-real-ip") || null,
    userAgent: headers?.get("user-agent")?.slice(0, 500) || null,
  };
}
