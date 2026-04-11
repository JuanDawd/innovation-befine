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
      {/* Diamond mark */}
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary"
        style={{ transform: "rotate(45deg)" }}
        aria-hidden="true"
      >
        <span
          style={{ transform: "rotate(-45deg)" }}
          className="font-serif text-xs font-bold text-primary-foreground leading-none"
        >
          B
        </span>
      </span>

      {variant === "full" && (
        <span className="font-serif text-base font-bold tracking-tight text-sidebar-foreground">
          Befine
        </span>
      )}
    </span>
  );
}
