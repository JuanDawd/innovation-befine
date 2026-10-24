"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Whole-peso amount typed the way it's read: "120.000", not "120000".
 * Holds digits only (the same string a number input would give); shows them
 * with thousands separators and a "$" so zeros don't have to be counted.
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  ...props
}: {
  value: string;
  onValueChange: (digits: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const display = value === "" ? "" : Number(value).toLocaleString("es-CO");
  return (
    <div className={cn("relative", className)}>
      <span
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground"
        aria-hidden="true"
      >
        $
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="pl-6 font-mono tabular-nums"
        value={display}
        onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
      />
    </div>
  );
}
