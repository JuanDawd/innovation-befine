"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon } from "lucide-react";

const BASE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const JITTER_MS = 30 * 1000;

function nextDelay(failures: number): number {
  const base =
    failures === 0 ? BASE_INTERVAL_MS : Math.min(BASE_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * (2 * JITTER_MS + 1)) - JITTER_MS;
  return base + jitter;
}

export function VersionBanner() {
  const t = useTranslations("versionBanner");
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const currentBuildId = useRef(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev");

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let failures = 0;

    function clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function schedule() {
      clear();
      if (cancelled || document.hidden) return;
      timer = setTimeout(check, nextDelay(failures));
    }

    async function check() {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) {
          failures++;
        } else {
          failures = 0;
          const { buildId } = (await res.json()) as { buildId: string };
          if (buildId !== currentBuildId.current) {
            setOutdated(true);
            setDismissed(false);
            return;
          }
        }
      } catch {
        failures++;
      }
      schedule();
    }

    function onVisibility() {
      if (cancelled) return;
      if (document.hidden) {
        clear();
      } else {
        check();
      }
    }

    check();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
          <RefreshCwIcon className="size-3" aria-hidden="true" />
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
