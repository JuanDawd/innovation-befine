import * as Sentry from "@sentry/nextjs";

const PII_KEYS = ["email", "name", "phone", "guest_name", "client_name"];

/** Scrub PII from a string value (e.g. error messages like "User john@example.com not found") */
function scrubString(value: string): string {
  // Replace email addresses
  return value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
}

function scrubRecord(obj: Record<string, unknown>) {
  for (const key of PII_KEYS) {
    if (key in obj) obj[key] = "[Filtered]";
  }
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Only initialize if DSN is provided (optional in dev)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  beforeSend(event) {
    // Scrub PII from request body fields
    if (event.request?.data) {
      scrubRecord(event.request.data as Record<string, unknown>);
    }

    // Scrub PII from exception messages (e.g. "User john@example.com not found")
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) exc.value = scrubString(exc.value);
      }
    }

    // Scrub PII from breadcrumb messages and data
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.message) crumb.message = scrubString(crumb.message);
        if (crumb.data) scrubRecord(crumb.data as Record<string, unknown>);
      }
    }

    // Scrub PII from extra data
    if (event.extra) {
      scrubRecord(event.extra as Record<string, unknown>);
    }

    return event;
  },
});
