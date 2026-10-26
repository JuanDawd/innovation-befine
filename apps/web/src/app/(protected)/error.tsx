"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for every signed-in screen: the navigation stays, only the
 * page area shows the error, and the error reaches Sentry.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("globalTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("globalDescription")}</p>
      </div>
      <Button onClick={reset}>{t("globalRetry")}</Button>
    </div>
  );
}
