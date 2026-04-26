import { type NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@befine/types";
import { auth } from "@/lib/auth";
import {
  isPublic,
  isShared,
  isAuthenticatedApi,
  roleCanAccess,
  isFinancialBlockedForSecretary,
  ROLE_HOME,
} from "@/lib/middleware-helpers";

/**
 * Middleware — session check and role-path enforcement.
 *
 * Uses auth.api.getSession() (cookieCache reads the encrypted cookie payload —
 * no HTTP round-trip to /api/auth/get-session, no rate-limit consumption).
 * Previously used betterFetch which made an HTTP request on every navigation,
 * rapidly exhausting Better Auth's built-in rate limiter.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Next.js prefetch requests don't carry cookies — skip auth so they don't
  // get redirected to /login and poison the router cache with a bad entry.
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next();
  }

  if (isPublic(pathname) || isShared(pathname)) {
    if (pathname === "/login") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (session) {
        const role = session.user.role as AppRole | undefined;
        const home = role ? (ROLE_HOME[role] ?? "/") : "/cashier";
        return NextResponse.redirect(new URL(home, request.url));
      }
    }
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticatedApi(pathname)) {
    return NextResponse.next();
  }

  const role = session.user.role as AppRole | undefined;

  if (role === "secretary" && isFinancialBlockedForSecretary(pathname)) {
    return NextResponse.rewrite(new URL("/403", request.url));
  }

  if (!roleCanAccess(role, pathname)) {
    return NextResponse.rewrite(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)"],
};
