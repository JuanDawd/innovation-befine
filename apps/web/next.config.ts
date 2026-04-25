import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA from "@ducanh2912/next-pwa";

// T10R-R1 — Content Security Policy + security headers.
// Inline theme-init script and Next.js runtime require 'unsafe-inline' on
// script-src; we tighten further once a nonce-based scheme is in place.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Scripts: self + inline (theme-init + Next chunks). 'unsafe-eval' only in dev for HMR.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.sentry.io`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Sentry ingest + Better Auth + same-origin SSE/API.
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
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
