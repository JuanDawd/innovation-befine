"use client";

/**
 * T09R-R16 — Service worker update prompt
 *
 * When Workbox's skipWaiting + clientsClaim activates a new SW, shows a
 * dismissible banner so users mid-session know a new version is live.
 */

import { useEffect, useState } from "react";
import { RefreshCwIcon, XIcon } from "lucide-react";

export function SwUpdatePrompt() {
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
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 shadow-lg dark:border-blue-700 dark:bg-blue-950/70 max-w-sm w-[calc(100%-2rem)]"
    >
      <RefreshCwIcon
        className="size-4 shrink-0 text-blue-700 dark:text-blue-300"
        aria-hidden="true"
      />
      <span className="flex-1 text-sm text-blue-800 dark:text-blue-200">
        Actualización disponible — recarga para aplicar
      </span>
      <button
        onClick={() => window.location.reload()}
        className="rounded px-2 py-1 text-xs font-medium text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900"
        aria-label="Recargar página"
      >
        Recargar
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="Cerrar aviso"
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
