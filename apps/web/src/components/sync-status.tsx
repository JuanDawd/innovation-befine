"use client";

/**
 * T080 — Sync status indicator
 *
 * Shows online/offline/syncing state + queue count in the nav bar.
 * For cashier roles shows a distinct badge for unsynced paid_offline checkouts.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WifiOffIcon, Loader2Icon, AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useQueueFlush } from "@/lib/use-queue-flush";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@befine/types";

export function SyncStatus({ role }: { role: AppRole }) {
  const t = useTranslations("sync");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const { pending, syncing, failed, retry } = useQueueFlush();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Online + nothing pending — hidden
  if (isOnline && pending === 0 && !syncing && failed === 0) return null;

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg dark:border-amber-700 dark:bg-amber-950/60 max-w-sm w-[calc(100%-2rem)]"
      >
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">{t("offlineTitle")}</span>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400 text-center">
          {t("offlineDescription")}
        </p>
        {role === "cashier_admin" && (
          <p className="text-xs text-amber-700 dark:text-amber-400 text-center font-medium">
            {t("offlineCashierNote")}
          </p>
        )}
        {pending > 0 && (
          <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-xs font-mono text-amber-900 dark:text-amber-200">
            {t("pendingCount", { count: pending })}
          </span>
        )}
        {failed > 0 && (
          <span className="rounded-full bg-red-200 dark:bg-red-900 px-2 py-0.5 text-xs font-mono text-red-900 dark:text-red-200">
            {t("failedCount", { count: failed })}
          </span>
        )}
        <button
          disabled
          title={t("retryWhenOnline")}
          aria-label={t("retryWhenOnline")}
          className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 opacity-50 cursor-not-allowed select-none"
        >
          <RefreshCwIcon className="size-3" aria-hidden="true" />
          {t("retry")}
        </button>
      </div>
    );
  }

  // Online + syncing or failed
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow text-sm"
    >
      {syncing ? (
        <>
          <Loader2Icon className="size-4 animate-spin text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">{t("syncing")}</span>
        </>
      ) : failed > 0 ? (
        <>
          <AlertCircleIcon className="size-4 text-destructive shrink-0" aria-hidden="true" />
          <span className="text-destructive">{t("failedCount", { count: failed })}</span>
          <Button size="sm" variant="ghost" onClick={retry} className="h-6 px-2 gap-1">
            <RefreshCwIcon className="size-3" aria-hidden="true" />
            {t("retry")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
