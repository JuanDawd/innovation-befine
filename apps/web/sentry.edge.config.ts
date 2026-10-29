import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENVIRONMENT, SENTRY_RELEASE, scrubEvent } from "./sentry.shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  tracesSampleRate: 0.05,
  enabled: !!process.env.SENTRY_DSN,
  beforeSend: scrubEvent,
});
