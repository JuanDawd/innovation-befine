"use client";

/**
 * AppUpdater — silent updates after a deploy (replaces the version banner and
 * the service-worker update prompt).
 *
 * Detects a new deployment two ways: /api/version returns another build id
 * (polled every ~15 min and when the tab comes back, L-08), or a new service
 * worker takes over a page that already had one (the first install is not an
 * update). It never shows anything: the next time the user navigates, the
 * page loads fully from the new build instead — a moment they are leaving the
 * page anyway, so no half-filled form is lost and nobody is nagged all day.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const BASE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const JITTER_MS = 60 * 1000;
const MIN_FOCUS_RECHECK_MS = 60 * 1000;

/** Spread the salon's devices (one public IP, rate-limited endpoint) apart. */
function nextDelay(failures: number): number {
  const base =
    failures === 0 ? BASE_INTERVAL_MS : Math.min(BASE_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
  // Timing spread only, not security: crypto keeps scanners quiet and costs nothing.
  const [r] = crypto.getRandomValues(new Uint32Array(1));
  const jitter = Math.floor((r! / 2 ** 32) * (2 * JITTER_MS + 1)) - JITTER_MS;
  return base + jitter;
}

export function AppUpdater() {
  const pathname = usePathname();
  const outdated = useRef(false);
  const lastPath = useRef(pathname);

  // A new build was detected: load the next page fresh.
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      if (outdated.current) window.location.reload();
    }
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    const currentBuildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let failures = 0;
    let lastCheckAt = 0;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (cancelled || document.hidden || outdated.current) return;
      timer = setTimeout(check, nextDelay(failures));
    };

    async function check() {
      if (cancelled || document.hidden || outdated.current) return;
      lastCheckAt = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) failures++;
        else {
          failures = 0;
          const { buildId } = (await res.json()) as { buildId: string };
          if (buildId !== currentBuildId) {
            outdated.current = true;
            return; // nothing more to learn until the reload
          }
        }
      } catch {
        failures++;
      }
      schedule();
    }

    function onVisibility() {
      if (cancelled) return;
      if (document.hidden) clear();
      else if (Date.now() - lastCheckAt >= MIN_FOCUS_RECHECK_MS) void check();
      else schedule();
    }

    // Only a replacement counts: on a first visit the worker takes control too.
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const hadController = Boolean(sw?.controller);
    const onControllerChange = () => {
      if (hadController) outdated.current = true;
    };

    void check();
    document.addEventListener("visibilitychange", onVisibility);
    sw?.addEventListener("controllerchange", onControllerChange);
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
      sw?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
