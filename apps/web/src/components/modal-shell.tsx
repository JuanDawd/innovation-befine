"use client";

/**
 * ModalShell — wrapper for intercept-route modal dialogs.
 *
 * Renders children inside a Dialog that is always open.
 * router.back() dismisses it and returns to the parent route.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  title: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

const MAX_WIDTH = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

export function ModalShell({ title, children, maxWidth = "md" }: ModalShellProps) {
  const router = useRouter();

  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
        onClick={close}
        aria-label="Cerrar"
        tabIndex={-1}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10",
          "max-h-[90dvh] overflow-y-auto",
          MAX_WIDTH[maxWidth],
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-base">{title}</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
