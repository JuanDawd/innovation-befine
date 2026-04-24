/**
 * Middleware logic helpers — T018
 *
 * Pure functions with no Next.js or external dependencies so they can be
 * imported and unit-tested directly in Vitest (jsdom environment).
 * The middleware.ts file uses these and remains a thin orchestration layer.
 */

import type { AppRole } from "@befine/types";

/** Routes that bypass the session check entirely */
export const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/api/auth",
  "/403",
  "/api/health",
  "/api/version",
];

/** Exact-match public paths (cannot use startsWith because "/" matches everything) */
export const PUBLIC_EXACT_PATHS = ["/"];

/**
 * API paths that bypass session and role-path checks entirely (truly public).
 * NOTE: /api/realtime was moved to AUTHENTICATED_API_PATHS — the SSE route
 * handler enforces its own session + per-channel role gate (T04R-R1).
 */
export const SHARED_PATHS: string[] = [];

/**
 * API paths that require an authenticated session but bypass the role-path
 * prefix check (since they don't live under any role's home prefix).
 * The route handler itself enforces the per-channel role restriction.
 */
export const AUTHENTICATED_API_PATHS = ["/api/realtime"];

/** App paths any authenticated role may access (regardless of role prefix) */
export const SHARED_APP_PATHS = ["/profile", "/large-orders"];

/** Where each role is redirected after login; also the route prefix they own */
export const ROLE_HOME: Record<AppRole, string> = {
  cashier_admin: "/cashier",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};

/**
 * Financial route patterns the secretary role must never access.
 * Enforced as a defence-in-depth layer on top of the base role-path check.
 * When financial screens are built they should land under /cashier or /admin —
 * these patterns act as an explicit safeguard if routing changes.
 */
export const SECRETARY_FINANCIAL_BLOCKED: string[] = [
  // Future API endpoints for financial data
  "/api/analytics",
  "/api/payouts",
  "/api/settlements",
  "/api/revenue",
  // Secretary-prefixed routes that must never expose financial data
  "/secretary/analytics",
  "/secretary/revenue",
  "/secretary/settlements",
  "/secretary/payouts",
];

export function isPublic(pathname: string): boolean {
  return PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function isShared(pathname: string): boolean {
  return SHARED_PATHS.some((p) => pathname.startsWith(p));
}

export function isAuthenticatedApi(pathname: string): boolean {
  return AUTHENTICATED_API_PATHS.some((p) => pathname.startsWith(p));
}

export function isSharedApp(pathname: string): boolean {
  return SHARED_APP_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Returns true if the role is permitted to access the path.
 * Each role owns its own prefix; cashier_admin also owns /admin.
 * All authenticated roles can access SHARED_APP_PATHS (e.g. /profile).
 */
export function roleCanAccess(role: AppRole | undefined, pathname: string): boolean {
  if (!role) return false;
  if (isSharedApp(pathname)) return true;
  const home = ROLE_HOME[role];
  return pathname.startsWith(home) || (role === "cashier_admin" && pathname.startsWith("/admin"));
}

/**
 * Returns true if the path is a financial route that the secretary role
 * must never access, regardless of other checks.
 */
export function isFinancialBlockedForSecretary(pathname: string): boolean {
  return SECRETARY_FINANCIAL_BLOCKED.some((p) => pathname.startsWith(p));
}

/**
 * Type-safe role check for use in server actions.
 * Accepts the user object (or any object with a `role` property) from a Better Auth session.
 *
 * @example
 *   if (!hasRole(session.user, "cashier_admin")) return FORBIDDEN;
 */
export function hasRole(user: { role?: string | null }, ...roles: AppRole[]): boolean {
  return roles.includes(user.role as AppRole);
}
