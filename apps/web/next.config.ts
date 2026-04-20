import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@befine/types", "@befine/db", "@befine/realtime"],
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

export default withSentryConfig(withNextIntl(nextConfig), {
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
