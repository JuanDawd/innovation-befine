"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function VersionBanner() {
  const t = useTranslations("versionBanner");
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const currentBuildId = useRef(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");

  useEffect(() => {
    // Skip polling in dev where build IDs are always "dev"
    if (currentBuildId.current === "dev") return;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId: string };
        if (buildId !== currentBuildId.current) {
          setOutdated(true);
          setDismissed(false);
        }
      } catch {
        // network error — ignore silently
      }
    }

    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!outdated || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground"
    >
      <span>{t("message")}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-md bg-primary-foreground/15 px-3 py-1 text-xs font-medium hover:bg-primary-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          {t("refresh")}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md px-2 py-1 text-xs opacity-75 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
          aria-label={t("dismiss")}
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
