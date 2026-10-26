/**
 * L-48 — origins Better Auth accepts requests from.
 *
 * Derived from BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL plus an optional
 * comma-separated BETTER_AUTH_TRUSTED_ORIGINS, so a custom domain or a
 * self-hosted/LAN deployment works without a code change. The original
 * vercel.app origin stays trusted in production.
 *
 * Vercel previews: every deployment has its own URL, so on VERCEL_ENV=preview
 * (never production) the deployment's own VERCEL_URL and VERCEL_BRANCH_URL
 * are trusted and the branch URL becomes the auth base URL.
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

/** The deployment's own origins on a Vercel preview; empty anywhere else. */
function previewOrigins(env: Record<string, string | undefined>): string[] {
  if (env.VERCEL_ENV !== "preview") return [];
  return [env.VERCEL_BRANCH_URL, env.VERCEL_URL]
    .map((host) => (host?.trim() ? originOf(`https://${host.trim()}`) : null))
    .filter((o): o is string => o !== null);
}

/** Better Auth baseURL: the preview's branch URL on previews, else BETTER_AUTH_URL. */
export function resolveAuthBaseURL(env: Record<string, string | undefined>): string | undefined {
  return previewOrigins(env)[0] ?? env.BETTER_AUTH_URL;
}

export function resolveTrustedOrigins(env: Record<string, string | undefined>): string[] {
  const configured = [
    ...previewOrigins(env),
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ].map(originOf);

  const fallback =
    env.NODE_ENV === "development" ? "http://localhost:3000" : LEGACY_PRODUCTION_ORIGIN;

  return [...new Set([fallback, ...configured.filter((o): o is string => o !== null)])];
}
