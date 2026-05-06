"use client";

import * as React from "react";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
  "aria-label": ariaLabel,
}: {
  value: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <BaseProgress.Root
      value={value}
      max={max}
      aria-label={ariaLabel}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <BaseProgress.Track className="h-full w-full">
        <BaseProgress.Indicator
          className={cn("h-full rounded-full transition-all", indicatorClassName ?? "bg-primary")}
          style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}

export { Progress };
