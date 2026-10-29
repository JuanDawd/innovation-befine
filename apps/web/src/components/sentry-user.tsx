"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Tags browser Sentry events with the signed-in user — id and role only,
 * never name or email. Cleared on unmount (sign-out leaves the layout).
 */
export function SentryUser({ id, role }: { id: string; role: string }) {
  useEffect(() => {
    Sentry.setUser({ id, role });
    Sentry.setTag("role", role);
    return () => {
      Sentry.setUser(null);
      Sentry.setTag("role", undefined);
    };
  }, [id, role]);
  return null;
}
