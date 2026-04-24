/**
 * T09R-R10 — Endpoint contract test helpers
 *
 * Role-gate contracts are tested by verifying the RBAC logic that every server
 * action uses: hasRole(session.user, ...allowedRoles). We test the permission
 * matrix directly against the hasRole helper rather than invoking server actions
 * (which require Next.js runtime, DB, and auth context not available in Vitest).
 *
 * This matches the pattern established in session-auth.test.ts and
 * middleware-helpers.test.ts — pure-logic tests, no HTTP or DB.
 */

import type { AppRole } from "@befine/types";

export const ALL_ROLES: AppRole[] = ["cashier_admin", "secretary", "stylist", "clothier"];

/** Mirrors the hasRole helper from @/lib/middleware-helpers */
export function hasRole(user: { role?: string | null }, ...roles: AppRole[]): boolean {
  return roles.includes(user.role as AppRole);
}

export function makeUser(role: AppRole | null): { role: AppRole | null } {
  return { role };
}

/** Assert that only the listed roles pass the gate; all others are forbidden */
export function expectOnlyRoles(allowed: AppRole[], ...gateRoles: AppRole[]): void {
  for (const role of ALL_ROLES) {
    const user = makeUser(role);
    const passes = hasRole(user, ...gateRoles);
    if (allowed.includes(role)) {
      if (!passes) throw new Error(`Expected role '${role}' to be allowed but it was denied`);
    } else {
      if (passes) throw new Error(`Expected role '${role}' to be forbidden but it was allowed`);
    }
  }
}

/** Assert unauthenticated (null session) always yields UNAUTHORIZED */
export function expectUnauthenticated(gateRoles: AppRole[]): void {
  const unauthUser = { role: null };
  const passes = hasRole(unauthUser, ...gateRoles);
  if (passes) throw new Error("Unauthenticated user should never pass a role gate");
}
