import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Only initialize if DSN is provided (optional in dev)
  enabled: !!process.env.SENTRY_DSN,

  beforeSend(event) {
    // Scrub PII — client names, emails, phone numbers must not appear in Sentry
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      for (const key of ["email", "name", "phone", "guest_name", "client_name"]) {
        if (key in data) data[key] = "[Filtered]";
      }
    }
    return event;
  },
});
