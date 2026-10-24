import pino from "pino";

/**
 * Structured logger for business logic — T085
 *
 * Use for business events (checkout, settlement, assignment). Uncaught errors
 * go to Sentry automatically via instrumentation.ts; an error you catch and turn
 * into a generic ActionResult must be logged and sent with Sentry.captureException
 * so the cause isn't lost (M-61).
 *
 * Usage:
 *   logger.info({ ticketId, action: "checkout" }, "Ticket checked out");
 *   logger.warn({ employeeId }, "Payout duplicate attempt blocked");
 *
 * Note: pino-pretty uses thread-stream (worker threads) which breaks under
 * Next.js / Turbopack due to path rewriting. In dev we use plain JSON output
 * to stdout instead — readable enough, no worker threads.
 */
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    // Never log PII — client names, emails, phones
    paths: ["*.email", "*.phone", "*.name", "*.guest_name", "*.client_name"],
    censor: "[Filtered]",
  },
});
