/**
 * BrandLogo — T105
 *
 * Renders the Innovation Befine wordmark.
 * Used in the app shell header and login page.
 */

import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  /** Icon + text (default) or icon only */
  variant?: "full" | "icon";
}

export function BrandLogo({ className, variant = "full" }: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-2 select-none", className)}>
      {/* Diamond mark — Fraunces B, rotated */}
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary"
        style={{ transform: "rotate(45deg)" }}
        aria-hidden="true"
      >
        <span
          style={{ transform: "rotate(-45deg)", fontFamily: "var(--font-display)" }}
          className="text-xs font-semibold italic text-primary-foreground leading-none"
        >
          B
        </span>
      </span>

      {variant === "full" && (
        <span
          className="text-base font-medium italic tracking-tight text-sidebar-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Innovation Befine
        </span>
      )}
    </span>
  );
}
