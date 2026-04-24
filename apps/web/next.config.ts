import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  transpilePackages: ["@befine/types", "@befine/db", "@befine/realtime"],
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_ID ?? "dev",
  },
  // Required by Sentry's OpenTelemetry instrumentation.
  // pino + thread-stream must be external to avoid Turbopack mangling worker paths.
  serverExternalPackages: [
    "import-in-the-middle",
    "require-in-the-middle",
    "pino",
    "pino-pretty",
    "thread-stream",
  ],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// T081 — Service worker with Workbox
// Disabled in dev to avoid cache interference; enabled only on production builds.
const withPWAConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV !== "production",
  // App shell: Cache First — JS/CSS/fonts always available offline
  // API GETs (catalog, clients): Stale While Revalidate
  // POST/PUT mutations: NetworkOnly — handled by IndexedDB queue instead
  workboxOptions: {
    runtimeCaching: [
      {
        // T09R-R4: Explicit NetworkOnly for all mutating methods so they are
        // never cached regardless of Workbox version defaults.
        urlPattern: ({ request }: { request: Request }) =>
          ["POST", "PUT", "DELETE", "PATCH"].includes(request.method),
        handler: "NetworkOnly",
      },
      {
        // App shell — Cache First
        urlPattern: /^https:\/\/.*\.(js|css|woff2|woff|ttf)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        // Catalog & reference data — Stale While Revalidate (GET only)
        urlPattern: ({ url, request }: { url: URL; request: Request }) =>
          request.method === "GET" && /\/api\/(?!realtime)/i.test(url.pathname),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "api-cache",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
        },
      },
    ],
    // Skip waiting and claim clients immediately on SW update
    skipWaiting: true,
    clientsClaim: true,
  },
});

export default withSentryConfig(withPWAConfig(withNextIntl(nextConfig)), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress all CLI output when no auth token (local/CI without Sentry)
  silent: !process.env.SENTRY_AUTH_TOKEN,

  telemetry: false,

  // Disable source map upload if no auth token
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
