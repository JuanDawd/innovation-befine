/**
 * L-48 — origins Better Auth accepts requests from.
 *
 * Derived from BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL plus an optional
 * comma-separated BETTER_AUTH_TRUSTED_ORIGINS, so a custom domain or a
 * self-hosted/LAN deployment works without a code change. The original
 * vercel.app origin stays trusted in production.
 */

const LEGACY_PRODUCTION_ORIGIN = "https://innovation-befine.vercel.app";

function originOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

export function resolveTrustedOrigins(env: Record<string, string | undefined>): string[] {
  const configured = [
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ].map(originOf);

  const fallback =
    env.NODE_ENV === "development" ? "http://localhost:3000" : LEGACY_PRODUCTION_ORIGIN;

  return [...new Set([fallback, ...configured.filter((o): o is string => o !== null)])];
}
