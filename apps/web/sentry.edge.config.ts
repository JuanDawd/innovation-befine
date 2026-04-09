import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Lower sample rate for edge functions (middleware runs on every request)
  tracesSampleRate: 0.05,

  enabled: !!process.env.SENTRY_DSN,
});
