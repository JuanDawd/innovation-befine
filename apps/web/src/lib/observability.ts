import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

/**
 * Sentry helpers for server code (Node runtime — uses pino).
 *
 * reportError: an error we catch and turn into a generic ActionResult (or
 * deliberately swallow) must still be logged and sent, so the cause isn't
 * lost (M-61).
 *
 * financialBreadcrumb: audit trail for every money movement (CLAUDE.md
 * financial checklist). IDs, amounts and methods only — never names.
 */
export function reportError(
  err: unknown,
  action: string,
  extra: Record<string, unknown> = {},
  level: "error" | "warning" = "error",
): void {
  if (level === "warning") logger.warn({ err, action, ...extra }, `${action} degraded`);
  else logger.error({ err, action, ...extra }, `${action} failed`);
  Sentry.captureException(err, { level, tags: { action }, extra });
}

export function financialBreadcrumb(message: string, data: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: "financial", message, level: "info", data });
}
