import { cn } from "@/lib/utils";

interface NumericBadgeProps extends React.ComponentProps<"span"> {
  count: number;
  max?: number;
  variant?: "default" | "dot" | "pill";
  color?: "destructive" | "warning" | "info" | "success";
  label?: string;
}

function NumericBadge({
  count,
  max = 99,
  variant = "default",
  color = "destructive",
  label,
  className,
  ...props
}: NumericBadgeProps) {
  if (variant === "dot") {
    return (
      <span
        className={cn(
          "inline-block size-2.5 rounded-full",
          {
            "bg-destructive": color === "destructive",
            "bg-warning": color === "warning",
            "bg-info": color === "info",
            "bg-success": color === "success",
          },
          className,
        )}
        aria-label={label ?? `${count} items`}
        {...props}
      />
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          {
            "bg-destructive/10 text-destructive": color === "destructive",
            "bg-warning/10 text-warning-foreground": color === "warning",
            "bg-info/10 text-info": color === "info",
            "bg-success/10 text-success": color === "success",
          },
          className,
        )}
        {...props}
      >
        {label ?? count}
      </span>
    );
  }

  const displayCount = count > max ? `${max}+` : String(count);

  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
        {
          "bg-destructive text-white": color === "destructive",
          "bg-warning text-warning-foreground": color === "warning",
          "bg-info text-info-foreground": color === "info",
          "bg-success text-success-foreground": color === "success",
        },
        className,
      )}
      aria-label={label ?? `${count} items`}
      {...props}
    >
      {displayCount}
    </span>
  );
}

export { NumericBadge };
