import * as Sentry from "@sentry/nextjs";
import { SENTRY_ENVIRONMENT, SENTRY_RELEASE, scrubEvent } from "./sentry.shared";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: SENTRY_RELEASE,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: scrubEvent,
});

// The workday simulator (sim/) marks its browsers so their events can be
// told apart from real users' and grouped per run.
try {
  const simRun = window.localStorage.getItem("befine:sim-run");
  if (simRun) Sentry.setTag("sim_run", simRun);
} catch {
  // Storage blocked (private mode) — nothing to tag.
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
