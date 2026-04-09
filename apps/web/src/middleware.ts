import { betterFetch } from "@better-fetch/fetch";
import { type NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@befine/types";
import type { auth } from "@/lib/auth";

type SessionResponse = typeof auth.$Infer.Session;

/** Routes that don't require authentication */
const PUBLIC_PATHS = ["/login", "/reset-password", "/api/auth"];

/** Where each role lands after login */
const ROLE_HOME: Record<AppRole, string> = {
  cashier_admin: "/cashier",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { data: session } = await betterFetch<SessionResponse>("/api/auth/get-session", {
    baseURL: request.nextUrl.origin,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  // Unauthenticated → send to login (except public paths)
  if (!session) {
    if (isPublic(pathname)) return NextResponse.next();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated on login page → redirect to role home
  if (pathname === "/login") {
    const role = session.user.role as AppRole | undefined;
    const home = role ? (ROLE_HOME[role] ?? "/") : "/";
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
