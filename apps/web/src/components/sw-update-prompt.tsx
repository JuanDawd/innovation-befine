"use client";

/**
 * T09R-R16 — Service worker update prompt
 *
 * When Workbox's skipWaiting + clientsClaim activates a new SW, shows a
 * dismissible banner so users mid-session know a new version is live.
 */

import { useEffect, useState } from "react";
import { RefreshCwIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function SwUpdatePrompt() {
  const t = useTranslations("versionBanner");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      setVisible(true);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-[calc(var(--app-bottom-inset)+1rem)] left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-status-progress-foreground/30 bg-status-progress px-4 py-3 shadow-lg max-w-sm w-[calc(100%-2rem)]"
    >
      <RefreshCwIcon
        className="size-4 shrink-0 text-status-progress-foreground"
        aria-hidden="true"
      />
      <span className="flex-1 text-sm text-status-progress-foreground">{t("swMessage")}</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded px-2 py-1 text-xs font-medium text-status-progress-foreground border border-status-progress-foreground/30 hover:bg-status-progress"
        aria-label={t("swReloadLabel")}
      >
        {t("swReload")}
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label={t("swClose")}
        className="text-status-progress-foreground"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
