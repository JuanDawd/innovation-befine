import * as Sentry from "@sentry/nextjs";

const PII_KEYS = ["email", "name", "phone", "guest_name", "client_name"];

function scrubString(value: string): string {
  return value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
}

function scrubRecord(obj: Record<string, unknown>) {
  for (const key of PII_KEYS) {
    if (key in obj) obj[key] = "[Filtered]";
  }
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Only initialize if DSN is provided (optional in dev)
  enabled: !!process.env.SENTRY_DSN,

  beforeSend(event) {
    if (event.request?.data) {
      scrubRecord(event.request.data as Record<string, unknown>);
    }

    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) exc.value = scrubString(exc.value);
      }
    }

    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.message) crumb.message = scrubString(crumb.message);
        if (crumb.data) scrubRecord(crumb.data as Record<string, unknown>);
      }
    }

    if (event.extra) {
      scrubRecord(event.extra as Record<string, unknown>);
    }

    return event;
  },
});
