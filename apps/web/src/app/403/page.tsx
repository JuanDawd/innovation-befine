/**
 * 403 Forbidden page — T018
 *
 * Rendered via NextResponse.rewrite() in middleware when a user attempts
 * to access a route outside their role's permission boundary.
 * The URL in the browser is preserved (rewrite, not redirect).
 */

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/middleware-helpers";
import type { AppRole } from "@befine/types";

export default async function ForbiddenPage() {
  const t = await getTranslations("errors");

  // Best-effort: find the user's home to show a sensible "Go home" link.
  // The page may be rendered without a valid session in some edge cases —
  // fall back to /login.
  let homeHref = "/login";
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user.role) {
      const role = session.user.role as AppRole;
      homeHref = ROLE_HOME[role] ?? "/login";
    }
  } catch {
    // ignore — fallback to /login is safe
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <ShieldAlert className="size-12 text-destructive" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("forbidden")}</h1>
        <p className="text-sm text-muted-foreground">{t("forbiddenDescription")}</p>
      </div>
      <Link
        href={homeHref}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("goHome")}
      </Link>
    </main>
  );
}
