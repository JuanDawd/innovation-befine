import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Options shared by the client, server and edge Sentry inits: which
 * environment and build an event came from, and PII scrubbing.
 *
 * Both values are inlined by next.config.ts so the browser sees them too.
 */
export const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development";
export const SENTRY_RELEASE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const PII_KEYS = ["email", "name", "phone", "guest_name", "client_name"];

function scrubString(value: string): string {
  return value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
}

function scrubRecord(obj: Record<string, unknown>) {
  for (const key of PII_KEYS) {
    if (key in obj) obj[key] = "[Filtered]";
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
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
}
