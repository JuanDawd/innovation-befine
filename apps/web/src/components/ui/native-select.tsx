import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * NativeSelect — themed wrapper around the platform `<select>`.
 *
 * Keeps the OS picker (best on phones) but matches `Input` styling in both
 * themes. Drop-in replacement for `<select>`: same props, same events.
 * `className` sizes the wrapper (e.g. `w-full`, `max-w-xs`); use
 * `selectClassName` only to tweak the control itself.
 */
function NativeSelect({
  className,
  selectClassName,
  ...props
}: React.ComponentProps<"select"> & { selectClassName?: string }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative has-[select:disabled]:opacity-50", className)}
    >
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-1 pr-8 pl-2.5 text-base text-foreground transition-[color,border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground",
          selectClassName,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
