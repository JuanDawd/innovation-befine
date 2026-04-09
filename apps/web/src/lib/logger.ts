import pino from "pino";

/**
 * Structured logger for business logic — T085
 *
 * Use for business events (checkout, settlement, assignment) — NOT for errors.
 * Errors go to Sentry automatically via instrumentation.ts.
 *
 * Usage:
 *   logger.info({ ticketId, action: "checkout" }, "Ticket checked out");
 *   logger.warn({ employeeId }, "Payout duplicate attempt blocked");
 */
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  // In production (Vercel), emit JSON for log aggregators
  // In dev, emit readable output
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  }),
  redact: {
    // Never log PII — client names, emails, phones
    paths: ["*.email", "*.phone", "*.name", "*.guest_name", "*.client_name"],
    censor: "[Filtered]",
  },
});
