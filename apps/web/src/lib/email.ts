/**
 * Email utility — T054
 *
 * Shared transport for all transactional emails. Uses Resend + React Email.
 * Used by: T017 (password reset), T055 (appointment confirmation).
 *
 * Fire-and-forget: failed sends are logged but never crash the caller.
 */

import { Resend } from "resend";
import type { ReactElement } from "react";
import { reportError } from "./observability";

let _resend: Resend | undefined;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: ReactElement;
};

/**
 * Sends a transactional email. Returns true on success, false on failure.
 * Never throws — errors are logged to Sentry/logger and suppressed.
 */
export async function sendEmail({ to, subject, react }: SendEmailOptions): Promise<boolean> {
  const from = process.env.RESEND_FROM_EMAIL ?? "Innovation Befine <onboarding@resend.dev>";
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({ from, to, subject, react });
    if (error) {
      // The recipient is PII — only the subject goes to logs and Sentry.
      reportError(new Error(`Resend: ${error.name}: ${error.message}`), "sendEmail", { subject });
      return false;
    }
    return true;
  } catch (err) {
    reportError(err, "sendEmail", { subject });
    return false;
  }
}
