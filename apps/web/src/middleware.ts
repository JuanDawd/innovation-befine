import { betterFetch } from "@better-fetch/fetch";
import { type NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@befine/types";
import type { auth } from "@/lib/auth";

type SessionResponse = typeof auth.$Infer.Session;

/** Routes that don't require authentication */
const PUBLIC_PATHS = ["/login", "/reset-password", "/api/auth"];

/** Where each role lands after login — also the path prefix they are allowed to access */
const ROLE_HOME: Record<AppRole, string> = {
  cashier_admin: "/cashier",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};

/** Paths any authenticated user can access regardless of role */
const SHARED_PATHS = ["/api"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isShared(pathname: string) {
  return SHARED_PATHS.some((p) => pathname.startsWith(p));
}

/** Return true if the role is permitted to access this path */
function roleCanAccess(role: AppRole | undefined, pathname: string): boolean {
  if (!role) return false;
  const home = ROLE_HOME[role];
  // Each role owns its prefix; cashier_admin also owns /admin for future use
  return pathname.startsWith(home) || (role === "cashier_admin" && pathname.startsWith("/admin"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets (belt-and-suspenders alongside matcher)
  if (isPublic(pathname) || isShared(pathname)) {
    // Still need session to redirect authenticated users away from /login
    if (pathname === "/login") {
      const { data: session } = await betterFetch<SessionResponse>("/api/auth/get-session", {
        baseURL: request.nextUrl.origin,
        headers: { cookie: request.headers.get("cookie") ?? "" },
      });
      if (session) {
        const role = session.user.role as AppRole | undefined;
        const home = role ? (ROLE_HOME[role] ?? "/") : "/";
        return NextResponse.redirect(new URL(home, request.url));
      }
    }
    return NextResponse.next();
  }

  const { data: session } = await betterFetch<SessionResponse>("/api/auth/get-session", {
    baseURL: request.nextUrl.origin,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  // Unauthenticated → login
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.role as AppRole | undefined;

  // Role-path enforcement: each role may only access its own subtree
  if (!roleCanAccess(role, pathname)) {
    // Redirect to the role's own home rather than a hard 403
    // (a 403 page doesn't exist yet; redirect is safer for Phase 0)
    const home = role ? (ROLE_HOME[role] ?? "/") : "/login";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
