import { betterFetch } from "@better-fetch/fetch";
import { type NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@befine/types";
import type { auth } from "@/lib/auth";
import {
  isPublic,
  isShared,
  isAuthenticatedApi,
  roleCanAccess,
  isFinancialBlockedForSecretary,
  ROLE_HOME,
} from "@/lib/middleware-helpers";

type SessionResponse = typeof auth.$Infer.Session;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || isShared(pathname)) {
    // Redirect already-authenticated users away from /login to their role home
    if (pathname === "/login") {
      const { data: session } = await betterFetch<SessionResponse>("/api/auth/get-session", {
        baseURL: request.nextUrl.origin,
        headers: { cookie: request.headers.get("cookie") ?? "" },
      });
      if (session) {
        const role = session.user.role as AppRole | undefined;
        const home = role ? (ROLE_HOME[role] ?? "/") : "/cashier";
        return NextResponse.redirect(new URL(home, request.url));
      }
    }
    return NextResponse.next();
  }

  const { data: session } = await betterFetch<SessionResponse>("/api/auth/get-session", {
    baseURL: request.nextUrl.origin,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  // Unauthenticated → /login with callbackUrl
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated API paths bypass the role-path prefix check.
  // The route handler enforces its own per-channel role restriction.
  if (isAuthenticatedApi(pathname)) {
    return NextResponse.next();
  }

  const role = session.user.role as AppRole | undefined;

  // Secretary financial restriction (defence-in-depth)
  if (role === "secretary" && isFinancialBlockedForSecretary(pathname)) {
    return NextResponse.rewrite(new URL("/403", request.url));
  }

  // Role-path enforcement: wrong role → 403
  if (!roleCanAccess(role, pathname)) {
    return NextResponse.rewrite(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)"],
};
