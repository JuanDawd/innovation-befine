/**
 * Middleware logic helpers — T018
 *
 * Pure functions with no Next.js or external dependencies so they can be
 * imported and unit-tested directly in Vitest (jsdom environment).
 * The middleware.ts file uses these and remains a thin orchestration layer.
 */

import type { AppRole } from "@befine/types";

/** Routes that bypass the session check entirely */
export const PUBLIC_PATHS = ["/login", "/reset-password", "/api/auth", "/403", "/roadmap"];

/**
 * Exact-match public paths. Used for routes where prefix matching would be
 * unsafe — `/` would otherwise match everything, and `/api/health` /
 * `/api/version` would otherwise expose any future `/api/health-admin` or
 * `/api/version-internal` route to the public (T10R-R9).
 */
export const PUBLIC_EXACT_PATHS = ["/", "/api/health", "/api/version"];

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
  cashier: "/cashier",
  admin: "/admin",
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
 * Each role owns its own prefix; admin also owns /cashier.
 * All authenticated roles can access SHARED_APP_PATHS (e.g. /profile).
 *
 * @param cashierCanAccessAdmin - when true, the "cashier" role is also
 *   allowed to access /admin routes. Sourced from business_settings with a short TTL cache.
 */
export function roleCanAccess(
  role: AppRole | undefined,
  pathname: string,
  cashierCanAccessAdmin = false,
): boolean {
  if (!role) return false;
  if (isSharedApp(pathname)) return true;
  const home = ROLE_HOME[role];
  if (pathname.startsWith(home)) return true;
  // admin role always has access to both /admin and /cashier
  if (role === "admin" && pathname.startsWith("/cashier")) return true;
  // cashier role can access /admin when the toggle is enabled
  if (cashierCanAccessAdmin && role === "cashier" && pathname.startsWith("/admin")) return true;
  return false;
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
 *   if (!hasRole(session.user, "admin")) return FORBIDDEN;
 */
export function hasRole(user: { role?: string | null }, ...roles: AppRole[]): boolean {
  return roles.includes(user.role as AppRole);
}
